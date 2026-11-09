MANUAL.add({
 "id": "ltx25",
 "title": {
  "ko": "LTX 2.5 ONE STUDIO",
  "en": "LTX 2.5 ONE STUDIO"
 },
 "lead": {
  "ko": "LTX 2.5 영상+오디오 생성 노드. H3와 같은 배치에 클립별 세그먼트 타임라인(LTX Director)과 2단계 렌더를 더했습니다.",
  "en": "LTX 2.5 video + audio node. The same layout as H3, plus a per-clip segment timeline (LTX Director) and a two-stage render."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 맨 위 탭** — Asset · Text To Video · Image to Video (F/L) · LTX Director · Postprocess.\n**2. 오른쪽 위 아이콘** — 🗑 RAM/VRAM 비우기 · ⚙ 설정 · 🖼 갤러리 · ⛶ 노드 전체 화면 · ? 도움말.\n**3. 왼쪽 패널** — 접이식 항목 Canvas · Clip length · Images · LoRA · Upscale · Continuity · Sampling. 접힌 줄에 지금 값이 보입니다(예: `16:9 Landscape · 0.5 MP`, `5.04s × 1 · 5.04s total`, `euler_ancestral · 12 steps`). 항목을 누르면 펼쳐지고, 펼침 상태는 기억됩니다.\n**4. 가운데 프리뷰** — 샘플링 중 프레임이 실시간으로 나옵니다. 아래에 진행 상태(Idle …)와 시간 표시줄.\n**5. 프롬프트 영역** — 클립별 프롬프트 칸(체크박스로 켜기/끄기)과 Auto Prompt, **Global**(공통 프롬프트), Refine, Prompt Write, Prompt Edit, `+`(클립 추가), `↕`(펼치기). 프롬프트 개수와 클립 수, 총 길이가 위에 표시됩니다(예: `1 prompt · 1 on → 1 clip · 5.04s`).\n**6. 왼쪽 아래** — SEED와 시드 모드(Random 등), **Generate / Stop**.",
    "en": "**1. Tabs at the top** — Asset · Text To Video · Image to Video (F/L) · LTX Director · Postprocess.\n**2. Icons at the top right** — 🗑 free RAM/VRAM · ⚙ settings · 🖼 gallery · ⛶ full-screen node · ? help.\n**3. Left panel** — collapsible sections Canvas · Clip length · Images · LoRA · Upscale · Continuity · Sampling. A closed section shows its current value (e.g. `16:9 Landscape · 0.5 MP`, `5.04s × 1 · 5.04s total`, `euler_ancestral · 12 steps`). Click a section to open it; the open / closed state is remembered.\n**4. Preview (middle)** — frames stream in while sampling. Below it: a status line (Idle …) and a time bar.\n**5. Prompt area** — one prompt box per clip (a checkbox turns it on / off), Auto Prompt, **Global** (the shared prompt), Refine, Prompt Write, Prompt Edit, `+` (add a clip) and `↕` (expand). The header counts prompts, clips and total length (e.g. `1 prompt · 1 on → 1 clip · 5.04s`).\n**6. Bottom left** — SEED and its mode (Random, …), **Generate / Stop**."
   },
   "img": {
    "src": "img/ltx25-main.png",
    "cap": {
     "ko": "LTX 2.5 ONE STUDIO — Text To Video 모드",
     "en": "LTX 2.5 ONE STUDIO — Text To Video mode"
    }
   }
  },
  {
   "h": {
    "ko": "모드",
    "en": "Modes"
   },
   "body": {
    "ko": "• **Asset** — 이미지·영상·오디오를 등록·정리하는 라이브러리(H3와 같은 구조). 프롬프트에서 `@토큰`으로 부르고, First/Last 프레임을 파일 대신 라이브러리에서 고를 수 있습니다.\n• **Text To Video** — 클립마다 프롬프트 한 칸. **프롬프트 하나가 클립 하나**이고, 더 길게 만들려면 프롬프트를 추가하거나 브리프를 샷으로 나눕니다.\n• **Image to Video (F/L)** — 첫 프레임과 (선택적으로) 마지막 프레임 이미지를 1~2장 지정합니다.\n• **LTX Director** — 클립마다 **세그먼트 타임라인**(이미지·텍스트·오디오·영상 가이드를 시간 위에 배치)을 편집합니다. 이 모드의 프롬프트 칸은 그 클립의 공통(Global) 프롬프트이고, 세그먼트는 **Prompt Edit** 창에서 씁니다.\n• **Postprocess** — 이미 만든 클립에 Deblur → Denoise → Upscale → Skin Retouch → Add Grain → Interpolate → Resize를 적용합니다.",
    "en": "• **Asset** — a library for registering and organising images, videos and audio (same structure as H3). Call items from a prompt with `@tokens`, and pick the First / Last frames from the library instead of files.\n• **Text To Video** — one prompt box per clip. **One prompt is one clip**; to make a longer piece add prompts or split the brief into shots.\n• **Image to Video (F/L)** — give one or two images: the first frame and, optionally, the last frame.\n• **LTX Director** — edit a **segment timeline** per clip (place images, text, audio and guide video over time). In this mode the prompt box holds the clip's global prompt and the segments are written in the **Prompt Edit** window.\n• **Postprocess** — applies Deblur → Denoise → Upscale → Skin Retouch → Add Grain → Interpolate → Resize to an existing clip."
   }
  },
  {
   "h": {
    "ko": "왼쪽 패널 항목",
    "en": "Left panel sections"
   },
   "body": {
    "ko": "**Canvas** — **Aspect**(9:16 Portrait · 2:3 · 3:4 · 4:5 · 1:1 Square · 5:4 · 4:3 · 3:2 · 16:9 Landscape · 21:9 Cinema)와 **Megapixels**(기본 0.5, 직접 입력). 해상도는 이 둘로 정해집니다. 아래 \"렌더 방식\"처럼 1단계는 절반 크기로 그립니다.\n\n**Clip length** — 한 클립의 길이를 2~20초에서 고릅니다(24fps, 프레임 수는 8의 배수 + 1 격자라 `5 s (121f)`처럼 표시). **Custom (seconds)…**로 초를 직접 넣을 수도 있고, 입력값은 가장 가까운 유효 프레임 수로 맞춰집니다. 제목 옆 ?에 올리면 설명이 나옵니다: **전체 길이는 프롬프트가 정합니다** — 프롬프트 하나가 클립 하나이므로 더 길게 만들려면 프롬프트를 추가(또는 브리프를 샷으로 분할)하세요. 각 클립은 따로 저장되고, 나중에 🖼 Gallery → 🔗 Stitch로 합칩니다. 접힌 줄은 `클립 길이 × 클립 수 · 총 길이`를 보여 줍니다.\n\n**Images** — 모드에 따라 다릅니다. Text To Video는 이미지를 쓰지 않습니다. **Image to Video (F/L)**은 **① First frame**(필수에 가깝고)과 **② Last frame**(선택)을 클릭하거나 끌어 놓아 넣고(칸의 🖼로 갤러리에서도 고름), 파일 대신 Asset 라이브러리에서 고르는 전환 스위치가 있습니다. 한 장만 있으면 그 장이 첫 프레임이고(②만 있으면 마지막 프레임), 두 장이면 첫+끝입니다. **캔버스는 첫 이미지의 모양을 따르고**(같은 Megapixels), 마지막 이미지는 그 모양에 맞춰 **가운데를 잘라 씁니다**(늘리지 않음). 둘 다 없으면 Text only와 같습니다. 클립마다 자기 이미지로 바꾸는 것은 Prompt Edit에서 합니다. LTX Director에서는 이미지를 각 클립의 타임라인에 Prompt Edit에서 올립니다.\n\n**LoRA** — LoRA를 여러 개 추가하고 하나씩 켜고 끕니다(접힌 줄에 `2 active`처럼 켜진 개수 표시).\n\n**Upscale** — 두 단계가 이어서 실행됩니다. **Deblur (before upscale)**: None / Low / Medium / High / Ultra — 클립 자신의 해상도에서 흐리거나 움직임으로 번진 프레임을 선명하게 하며 크기는 바꾸지 않습니다. 업스케일을 끄고 Deblur만 쓸 수도 있습니다(RTX Deblur 노드 `TJ_RTXDeblur`가 필요). **Upscale**: None · **Upscale Model** · **RTX VSR** · **FlashVSR VSR**. RTX VSR은 Quality(LOW~ULTRA)와 크기 지정 방식 4가지(Scale ×, Short, Long, W×H)를 고릅니다. FlashVSR은 Model(FlashVSR / FlashVSR-v1.1), Mode(tiny / tiny-long / full), Scale(2~4), Tile 크기(기본 384, 16GB 카드 기준) 등을 정합니다.\n\n**Continuity** — 클립을 어떻게 잇는지: **None**은 아무것도 넘기지 않고 각 클립을 자기 프롬프트로만 만들며(공통 프롬프트만 일관성을 잡습니다), **Last Frame Chain**은 이전 클립의 마지막 프레임에서 다음 클립을 시작합니다.\n\n**Sampling** — **Sampler**(기본 euler_ancestral), **Scheduler (stage 1)**(기본 linear_quadratic), **Stage 1 steps**(기본 12), **CFG**(기본 1), **Stage 2 sigmas**(문자열). 1단계는 절반 크기로 그리고, latent 업스케일러가 2배로 키운 뒤 2단계가 위 sigmas로 다듬습니다.",
    "en": "**Canvas** — **Aspect** (9:16 Portrait · 2:3 · 3:4 · 4:5 · 1:1 Square · 5:4 · 4:3 · 3:2 · 16:9 Landscape · 21:9 Cinema) and **Megapixels** (default 0.5, typed). The resolution follows from these two; as described under \"How it renders\", stage 1 draws at half size.\n\n**Clip length** — pick one clip's length from 2 to 20 seconds (24 fps; the frame count is on an 8-multiple-plus-1 grid, shown like `5 s (121f)`). **Custom (seconds)…** lets you type seconds, which snap to the nearest valid frame count. The ? next to the title explains: **the total length follows the prompts** — one prompt is one clip, so to make a longer piece add prompts (or split the brief into shots). Each clip is saved on its own and combined later with 🖼 Gallery → 🔗 Stitch. The closed line shows `clip length × clip count · total`.\n\n**Images** — depends on the mode. Text To Video uses no images. **Image to Video (F/L)** takes **① First frame** and **② Last frame** (optional) by click or drag-and-drop (the 🖼 on a slot picks from a gallery), with a switch to pick from the Asset library instead of files. One image is the first frame (or, if only ② is set, the last frame); two images are first + last. **The canvas takes the shape of the first image** (same megapixels) and the last image is **centre-cropped** to that shape (never stretched). With neither, it behaves like Text only. Swapping a clip's own images is done in Prompt Edit. In LTX Director images are placed on each clip's timeline in Prompt Edit.\n\n**LoRA** — add several LoRAs and switch each on or off (the closed line shows how many are on, like `2 active`).\n\n**Upscale** — two steps that run back to back. **Deblur (before upscale)**: None / Low / Medium / High / Ultra — sharpens soft or motion-blurred frames at the clip's own resolution and never changes the size; it works with Upscale set to None (it needs the `TJ_RTXDeblur` node). **Upscale**: None · **Upscale Model** · **RTX VSR** · **FlashVSR VSR**. RTX VSR has Quality (LOW–ULTRA) and four size modes (Scale ×, Short, Long, W×H). FlashVSR has Model (FlashVSR / FlashVSR-v1.1), Mode (tiny / tiny-long / full), Scale (2–4), Tile size (default 384, tuned for a 16GB card) and more.\n\n**Continuity** — how clips are joined: **None** hands nothing across, so each clip is made from its own prompt (only the common prompt keeps them consistent); **Last Frame Chain** starts each clip from the previous clip's final frame.\n\n**Sampling** — **Sampler** (default euler_ancestral), **Scheduler (stage 1)** (default linear_quadratic), **Stage 1 steps** (default 12), **CFG** (default 1) and **Stage 2 sigmas** (a string). Stage 1 renders at half size, the latent upscaler doubles it and stage 2 refines it with the sigmas above."
   }
  },
  {
   "h": {
    "ko": "프롬프트 영역과 Prompt Edit",
    "en": "The prompt area and Prompt Edit"
   },
   "body": {
    "ko": "노드 아래의 프롬프트 줄은 한눈에 보기용이고, 제대로 쓸 때는 **📝 Prompt Edit** 창을 엽니다.\n• **프롬프트 세트** — 맨 위 드롭다운에서 이름 붙여 저장한 세트를 **Load / Save / Delete**합니다. 서버에 파일로 저장되어 브라우저 저장소를 지워도 남고, **H3와는 완전히 따로** 저장됩니다.\n• **Undo / Reset / Close** — 마지막 변경 되돌리기, 프롬프트·머리말·꼬리말 초기화(확인 창), 닫기.\n• **GLOBAL PROMPT — all clips** — 모든 클립에 붙는 공통 프롬프트(화면 스타일, 장면, 조명, 카메라, 환경음과 음악). 자체 Undo / Clear / **Refine** 버튼이 있습니다.\n• **CLIPS 목록** — 클립마다 체크박스(끄면 그 클립은 건너뛰지만 번호와 시드 위치는 유지), 이름과 시간 범위(`0~5 sec`), `+`로 클립 추가, ✕로 삭제.\n• **클립 편집기** — 그 클립의 프롬프트(\"촬영, 동작, 카메라, 소리를 하나의 흐르는 문단으로\"). 글자 수와 실제 전송량(`sends 0`)이 표시됩니다.\n• **clip time override** — 체크하고 초를 넣으면 이 클립만 다른 길이로 만듭니다(오른쪽에 전체 길이 `global 5.04s`가 참고로 표시).\n• **override for this clip** — 체크하면 이 클립만 자기 전용 이미지와 설정을 쓰고 공통 값을 무시합니다.\n• **▶ Continue generating the clip / Select from the gallery** — 여러 클립 실행이 중간에 끊겼을 때 이어 만들기: 마지막으로 끝난 클립을 갤러리에서 고르면, 그 클립의 마지막 프레임을 이 클립의 첫 프레임으로 쓰고 앞의 클립은 꺼집니다. ✕로 취소하면 원래 상태로 돌아옵니다.\n• **👁 Preview sent text** — 이 클립이 실제로 보내는 최종 텍스트(공통 + 클립)를 미리 봅니다.\n• **PROMPT WRITER** — 프롬프트를 써 줄 모델(예: native CLIP)을 확인·변경하고(Brief / Vision 모델), **✨ Prompt Write**는 아이디어를 LTX-2.5 프롬프트 가이드에 맞는 클립별 프롬프트로 써 주며, **🔧 Prompt Refine**은 이미 쓴 프롬프트를 다듬습니다. **✓ Done**으로 닫습니다.",
    "en": "The prompt row under the node is for a quick look; for real writing open the **📝 Prompt Edit** window.\n• **Prompt sets** — the dropdown at the top **Loads / Saves / Deletes** named sets. They are stored as files on the server (so they survive clearing the browser) and are kept **completely apart from H3's**.\n• **Undo / Reset / Close** — undo the last change, reset prompts / header / footer (with a confirmation), close.\n• **GLOBAL PROMPT — all clips** — the shared prompt added to every clip (visual style, scene, lighting, camera, ambient sound and music). It has its own Undo / Clear / **Refine** buttons.\n• **CLIPS list** — a checkbox per clip (off = skipped, but it keeps its number and seed position), its name and time range (`0~5 sec`), `+` to add a clip and ✕ to delete.\n• **Clip editor** — that clip's prompt (\"the shot, the action, the camera and the sound, as one flowing paragraph\"). The character count and what is actually sent (`sends 0`) are shown.\n• **clip time override** — tick it and enter seconds to make just this clip a different length (the global length, `global 5.04s`, is shown for reference).\n• **override for this clip** — tick it to let this clip use its own images and settings instead of the shared ones.\n• **▶ Continue generating the clip / Select from the gallery** — resume an interrupted multi-clip run: pick the last finished clip from the gallery and this clip starts from that clip's final frame, while the clips before it are switched off. Press ✕ to cancel and restore the original state.\n• **👁 Preview sent text** — shows the final text this clip will actually send (shared + clip).\n• **PROMPT WRITER** — shows and changes the model that writes for you (the Brief / Vision models); **✨ Prompt Write** writes per-clip prompts from your idea following the LTX-2.5 prompt guide, and **🔧 Prompt Refine** polishes prompts you already have. **✓ Done** closes the window."
   },
   "img": {
    "src": "img/ltx25-promptedit.png",
    "cap": {
     "ko": "Prompt Edit 창(Text To Video 모드)",
     "en": "The Prompt Edit window (Text To Video mode)"
    }
   }
  },
  {
   "h": {
    "ko": "LTX Director — 세그먼트 타임라인",
    "en": "LTX Director — the segment timeline"
   },
   "body": {
    "ko": "LTX Director 모드에서 **Prompt Edit**을 열면 클립 편집기 안에 타임라인이 나옵니다. 클립 하나를 시간 위의 **세그먼트**들로 나눠, 어느 구간에 무엇을 보여 줄지 정합니다.\n• **트랙** — **MAIN**(영상 본체), **AUDIO**(소리 구간. 트랙에 `Inpaint: ON` 표시), **IC-LoRA Video**(가이드 영상 트랙. `Audio: OFF` 표시). 각 트랙의 👁로 보이기/숨기기, 빈 곳의 `+`로 추가합니다.\n• **추가 버튼** — **Add Image**, **Gallery**(갤러리에서), **Asset**(라이브러리에서), **Add Text**, **Add Audio**, **Add Video**, **Add IC Video**, **Delete**.\n• **Retake Mode (BETA)** 와 오른쪽의 도구 아이콘들(스냅 등), 눈금자(초 단위), 재생/루프, **Guide Strength**(가이드 세기), 확대/축소 슬라이더가 있습니다.\n• 세그먼트를 선택하면 아래 **SEGMENT PROMPT** 칸에서 그 구간의 프롬프트를 씁니다(\"No segment selected!\"이면 먼저 세그먼트를 고르세요).\n이 타임라인은 GPL-3.0 코드를 이 패키지에 복사한 것이라 웹/다른 프로젝트로 옮기면 안 됩니다(`THIRD_PARTY_NOTICES.md` 참고).",
    "en": "In LTX Director mode, **Prompt Edit** shows a timeline inside the clip editor. It splits one clip into **segments** over time and says what to show in each part.\n• **Tracks** — **MAIN** (the video itself), **AUDIO** (sound segments; the track shows `Inpaint: ON`) and **IC-LoRA Video** (a guide-video track; shows `Audio: OFF`). Each track's 👁 shows / hides it, and the `+` in an empty area adds a segment.\n• **Add buttons** — **Add Image**, **Gallery** (from a gallery), **Asset** (from the library), **Add Text**, **Add Audio**, **Add Video**, **Add IC Video** and **Delete**.\n• Also **Retake Mode (BETA)**, tool icons on the right (snapping and more), a ruler in seconds, play / loop, **Guide Strength** and zoom sliders.\n• Select a segment and write its prompt in **SEGMENT PROMPT** below (\"No segment selected!\" means pick a segment first).\nThis timeline is GPL-3.0 code copied into this package, so it must not be moved into a web or other non-GPL project (see `THIRD_PARTY_NOTICES.md`)."
   },
   "img": {
    "src": "img/ltx25-director-edit.png",
    "cap": {
     "ko": "LTX Director 모드의 Prompt Edit (세그먼트 타임라인)",
     "en": "Prompt Edit in LTX Director mode (the segment timeline)"
    }
   }
  },
  {
   "h": {
    "ko": "Postprocess",
    "en": "Postprocess"
   },
   "body": {
    "ko": "이미 만든 클립을 골라(From gallery / Upload) 아래 단계를 **항상 이 순서로** 적용합니다. 단계마다 켜고 끌 수 있고, 접힌 줄에 ON/OFF가 표시됩니다.\n**A. Deblur → B. Denoise → C. Upscale → D. Skin Retouch → E. Add Grain → F. Interpolate → G. Resize**\n• **Upscale**는 Upscale Model / RTX VSR / FlashVSR 중에서 고릅니다. **Add Grain**은 필름 그레인(Color 등)을 입힙니다. **Interpolate**는 프레임을 보간해 움직임을 부드럽게 하고, **Resize**는 목표 가로·세로로 맞춥니다.\n• 시작/끝(초)으로 구간을 정하고(끝 0 = 전체), **Preview**로 짧게 확인한 뒤 **Generate**로 전체를 만듭니다. 전용 Generate / Stop과 Compare 뷰어가 있습니다. 이 모드는 프롬프트가 필요 없습니다(\"No prompt needed\").",
    "en": "Pick an existing clip (From gallery / Upload) and the steps below are applied **always in this order**. Each step can be turned on or off, and its closed line shows ON / OFF.\n**A. Deblur → B. Denoise → C. Upscale → D. Skin Retouch → E. Add Grain → F. Interpolate → G. Resize**\n• **Upscale** is chosen from Upscale Model / RTX VSR / FlashVSR. **Add Grain** lays on film grain (with a Color setting and more). **Interpolate** interpolates frames for smoother motion and **Resize** fits the clip to a target width and height.\n• Set a range with start / end seconds (end 0 = the whole clip), check a short stretch with **Preview**, then make the whole thing with **Generate**. It has its own Generate / Stop and a Compare viewer. No prompt is needed in this mode."
   },
   "img": {
    "src": "img/ltx25-postprocess.png",
    "cap": {
     "ko": "Postprocess 모드",
     "en": "Postprocess mode"
    }
   }
  },
  {
   "h": {
    "ko": "갤러리 (🖼)",
    "en": "Gallery (🖼)"
   },
   "body": {
    "ko": "만든 클립과 합본이 한곳에 모입니다(영상 파일이라 이미지 노드의 갤러리와 다릅니다).\n• **카드** — 실제 첫 프레임 썸네일(서버가 ffmpeg로 추출해 캐시), 해상도·MP·비율(`1344x768px / 1.0MP 16:9`), 파일 이름, 길이·용량·날짜, 렌더에 쓴 프롬프트 한 줄. 합본은 **★ stitched** 표시가 붙고 카드 테두리 색이 다릅니다. 🖱 더블클릭하면 전체 화면 플레이어(Space 재생, ←→ 이동, `[` `]` 이전/다음, Esc 닫기)로 봅니다.\n• **카드 버튼** — **Reuse Setting**(그 클립을 만든 설정을 패널로 되돌림), **Extend Clip**(그 클립의 끝에서 이어서 만들기), **Prompt View**(렌더에 쓴 프롬프트 보기), **Prompt Copy**. 왼쪽 위 ⓘ는 \"무엇으로 렌더했는지\" 정보, ✕는 삭제(확인 창, 되돌릴 수 없음), 👁는 가리기입니다.\n• **위쪽 도구** — 필터(All …), **🔗 Stitch**(클릭한 순서대로 골라 하나로 합침. 이어붙이는 클립이면 겹친 프레임을 자르는 \"Chained (trim repeated frame)\" 옵션), **⬆ Upscale**, **🎞 Interpolate**, **↔ Resize**(완성된 영상 하나를 후처리), **🎵 Replace audio with:**(소리 바꾸기), **Show**(가린 항목 보기), ↻ 새로고침, **📂 Open folder**.\n• **눈가리기(👁)** — 카드의 👁를 누르면 그 클립의 썸네일(과 마우스 오버 미리보기 영상)이 **흐리게** 가려지고, 가려진 클립은 실제 영상 주소를 받지 않습니다. 가린 목록은 **서버에 하나**(`/tj_shared/sensitive_media`, 항목 키는 `하위폴더/파일이름`)만 있어서 모든 노드의 갤러리와 웹 앱이 같이 쓰므로, 한 곳에서 가리면 어디서든 가려집니다. 맨 위의 **👁 Show**를 누르면 가린 항목을 한꺼번에 잠깐 볼 수 있고(저장되지 않는 임시 보기, 다시 누르면 다시 가림), 전체 화면 플레이어에서도 같은 👁로 가리기/보이기를 바꿉니다.",
    "en": "Made clips and stitched files collect in one place (these are video files, so it differs from the image nodes' gallery).\n• **Cards** — a real first-frame thumbnail (extracted by ffmpeg on the server and cached), the resolution, MP and aspect (`1344x768px / 1.0MP 16:9`), file name, length · size · date, and a line of the prompt it was rendered from. A stitched file carries a **★ stitched** mark and a different border color. Double-click a card for the full-screen player (Space = play, ←→ = seek, `[` `]` = previous / next, Esc = close).\n• **Card buttons** — **Reuse Setting** (puts the settings that made the clip back into the panel), **Extend Clip** (continue from that clip's end), **Prompt View** (see the prompt it was rendered with) and **Prompt Copy**. ⓘ at the top left shows \"what it was rendered with\", ✕ deletes (confirmation, cannot be undone) and 👁 hides it.\n• **Tools at the top** — a filter (All …), **🔗 Stitch** (pick clips in click order and join them; for chained clips there is a \"Chained (trim repeated frame)\" option that cuts the repeated frame), **⬆ Upscale**, **🎞 Interpolate**, **↔ Resize** (post-process one finished video), **🎵 Replace audio with:**, **Show** (reveal hidden items), ↻ refresh and **📂 Open folder**.\n• **Hide (눈가리기, 👁)** — the 👁 on a card **blurs** that clip's thumbnail (and its hover-preview video), and a hidden clip never gets a real video address. The hidden list exists **once on the server** (`/tj_shared/sensitive_media`, keyed `subfolder/filename`) and is shared by every node's gallery and the web app, so hiding in one place hides it everywhere. **👁 Show** at the top peeks at every hidden item at once (a temporary view that is not saved; press again to re-hide), and the full-screen player has the same 👁 to hide or reveal."
   },
   "img": {
    "src": "img/ltx25-gallery.png",
    "cap": {
     "ko": "LTX 갤러리",
     "en": "The LTX gallery"
    }
   }
  },
  {
   "h": {
    "ko": "⚙ 설정 (Settings)",
    "en": "⚙ Settings"
   },
   "body": {
    "ko": "설정 창에는 **LTX Model**, **LLM Setting**, **Translation LLM**, **Preview**, **Output**, **Node Skin** 탭이 있습니다.\n**LTX Model** — 모델을 한 번만 정합니다: LTX 모델(.gguf 또는 .safetensors), Latent spatial upscaler(x2), 텍스트 인코더(.gguf는 TJ_NODE의 LTX25 CLIP GGUF 로더, 그 외는 CLIPLoader type ltxv), LTX 비디오 VAE와 오디오 VAE. **Distilled LoRA**(Apply the distilled LoRA, LoRA 파일, Strength)는 **증류되지 않은 모델에만** 켭니다 — 증류 모델에는 이미 들어 있으므로 끄세요. 미리보기용 TAE는 Preview 탭에서 고릅니다. 파일 위치: LTX 모델 → `models/diffusion_models/`, 업스케일러 → `models/latent_upscale_models/`, 텍스트 인코더 → `models/text_encoders/`, VAE → `models/vae/`. **↻ Refresh Models**로 폴더를 다시 읽고, 맨 아래 **THIRD-PARTY PACK STATUS**가 선택 설치 팩 상태를 알려 줍니다.\n**LLM Setting / Translation LLM** — 프롬프트 작성·Refine과 번역에 쓸 LLM. **Preview** — 라이브 프리뷰 옵션. **Output** — 저장 폴더. **Node Skin** — 이 노드의 색. 위쪽 **Save All**로 저장합니다.",
    "en": "The settings window has the tabs **LTX Model**, **LLM Setting**, **Translation LLM**, **Preview**, **Output** and **Node Skin**.\n**LTX Model** — models are set once: the LTX model (.gguf or .safetensors), the latent spatial upscaler (x2), the text encoder (a .gguf uses TJ_NODE's LTX25 CLIP GGUF loader, anything else CLIPLoader with type ltxv), and the LTX video and audio VAEs. **Distilled LoRA** (Apply the distilled LoRA, LoRA file, Strength) is **only for a non-distilled model** — leave it off for a distilled model, it is already part of it. The preview TAE is chosen in the Preview tab. File locations: LTX model → `models/diffusion_models/`, upscaler → `models/latent_upscale_models/`, text encoder → `models/text_encoders/`, VAEs → `models/vae/`. **↻ Refresh Models** rescans the folders and **THIRD-PARTY PACK STATUS** at the bottom reports the optional packs.\n**LLM Setting / Translation LLM** — the LLM for prompt writing / Refine and for translation. **Preview** — live-preview options. **Output** — the save folder. **Node Skin** — this node's colors. Use **Save All** at the top to save."
   },
   "img": {
    "src": "img/ltx25-settings.png",
    "cap": {
     "ko": "⚙ 설정 창의 LTX Model 탭",
     "en": "The LTX Model tab of the ⚙ settings window"
    }
   }
  },
  {
   "h": {
    "ko": "렌더 방식과 알아 둘 점",
    "en": "How it renders, and good to know"
   },
   "body": {
    "ko": "• **2단계 렌더** — 1단계는 절반 크기로 그리고, latent 업스케일러가 2배로 키운 뒤, 2단계가 Stage 2 sigmas로 다듬습니다.\n• **참조 기능** — `@ref`, MSR 같은 레퍼런스 기능은 원본처럼 LTX 2.5에서는 숨겨져 있습니다.\n• **브라우저 탭** — H3와 같은 클립 릴레이 구조라서 긴 실행 중에는 브라우저 탭을 닫거나 절전 모드로 두지 마세요(H3 페이지의 경고 참고).\n• **라이선스** — LTX Director 에디터는 GPL-3.0 코드를 이 패키지에 복사한 것입니다.\n• 노드 안 ? 도움말의 일부 문구는 H3의 설명을 그대로 가져온 것이라 LTX와 맞지 않을 수 있습니다. 이 매뉴얼의 설명을 기준으로 보세요.",
    "en": "• **Two-stage render** — stage 1 renders at half size, the latent upscaler doubles it, and stage 2 refines it with the Stage 2 sigmas.\n• **Reference features** — `@ref` and MSR stay hidden for LTX 2.5, as in the original.\n• **Browser tab** — it uses the same clip-relay structure as H3, so do not close the browser tab or let the PC sleep during a long run (see the warning on the H3 page).\n• **License** — the LTX Director editor is GPL-3.0 code copied into this package.\n• Some text in the node's built-in ? help was copied from H3's and may not fit LTX. Use this manual as the reference."
   }
  }
 ]
});

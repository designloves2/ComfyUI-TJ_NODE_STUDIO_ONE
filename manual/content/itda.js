MANUAL.add({
 "id": "itda",
 "title": {
  "ko": "ITDA ONE STUDIO",
  "en": "ITDA ONE STUDIO"
 },
 "lead": {
  "ko": "영상·오디오를 3개 레인에 올려 자르고, 겹치고, 이어 붙인 뒤 ffmpeg로 렌더하는 타임라인 편집 노드입니다(\"잇다\" = 이어 붙이다).",
  "en": "A timeline-editing node: put video and audio on three lanes, cut, overlap and join them, then render with ffmpeg (\"itda\" = to join)."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 맨 위 줄** — **☰ Menu**(프로젝트 메뉴), 프로젝트 이름, **🖼 Gallery**, 렌더 종류 선택(Video + Audio / Video Only / Audio Only), **⏺ Render**, ⛶ 노드 전체 화면.\n**2. Media Bin (왼쪽 위)** — 편집할 영상·오디오를 모아 두는 곳.\n**3. 프리뷰 (가운데 위)** — 재생 화면. Single / Compare / Overlay / Wipe 보기 방식과 재생 컨트롤.\n**4. Clip Properties (오른쪽, 접이식)** — 타임라인 도구 줄의 **▤ Properties**를 누르면 열립니다.\n**5. 타임라인 도구 줄** — 편집 도구 아이콘들(아래 \"도구 줄\" 참고)과 가로/세로 줌 슬라이더.\n**6. 타임라인** — 위쪽 눈금자(시간·프레임)와 **T1 · T2 · T3** 세 레인. 클립은 레인 위의 막대로 놓이고, 영상 클립에는 소리 파형이 보입니다. 맨 아래에 FPS, Snap 상태, 총 프레임, 상태 메시지가 있습니다.\n프리뷰와 타임라인 사이의 가는 줄을 위아래로 끌면 두 영역의 높이를 조절합니다.",
    "en": "**1. Top row** — **☰ Menu** (the project menu), the project name, **🖼 Gallery**, the render type (Video + Audio / Video Only / Audio Only), **⏺ Render** and ⛶ full-screen node.\n**2. Media Bin (top left)** — where the video and audio you edit are collected.\n**3. Preview (top middle)** — the playback screen, with the Single / Compare / Overlay / Wipe view modes and the transport controls.\n**4. Clip Properties (right, collapsible)** — opens with **▤ Properties** in the timeline tool row.\n**5. Timeline tool row** — the editing tool icons (see \"The tool row\" below) and the horizontal / vertical zoom sliders.\n**6. Timeline** — a ruler (time and frames) on top and three lanes **T1 · T2 · T3**. Clips sit on the lanes as bars, and video clips show their sound waveform. At the very bottom: FPS, Snap state, total frames and a status message.\nDrag the thin line between the preview and the timeline up or down to change the height of the two areas."
   },
   "img": {
    "src": "img/itda-main.png",
    "cap": {
     "ko": "ITDA ONE STUDIO — 미디어 빈의 영상 두 개를 T1 레인에 올린 모습",
     "en": "ITDA ONE STUDIO — two clips from the media bin placed on the T1 lane"
    }
   }
  },
  {
   "h": {
    "ko": "기본 작업 순서",
    "en": "Basic workflow"
   },
   "body": {
    "ko": "1. **Media Bin**에 영상/오디오를 가져옵니다(업로드 또는 갤러리에서).\n2. 카드를 **끌어서 타임라인의 레인에 놓습니다.** 놓은 위치가 클립의 시작이 됩니다. 소스가 길어도 처음에는 프로젝트 **Total Frames**까지만 들어오고, 나머지는 클립 끝을 끌어 늘릴 수 있습니다.\n3. 재생해 보며 **분할(✂)** 로 자르고, 클립을 끌어 옮기고, 가장자리를 끌어 길이(트림)를 조절합니다. **Snap**이 켜져 있으면 클립 가장자리가 서로 달라붙습니다.\n4. 필요하면 **Transition**, **Auto Stitch**, **AI Detect**, **Group / Stitch** 같은 도구를 씁니다.\n5. 위쪽에서 렌더 종류를 고르고 **⏺ Render**를 누르면 타임라인 전체가 ffmpeg로 렌더되어 **갤러리에 등록**됩니다.\n프로젝트는 **☰ Menu → 💾 Save Project**로 저장하고 다시 불러올 수 있습니다.",
    "en": "1. Bring video / audio into the **Media Bin** (upload, or from a gallery).\n2. **Drag a card onto a lane of the timeline.** Where you drop it is where the clip starts. A long source first comes in only up to the project's **Total Frames**; drag the clip's end to stretch it further.\n3. Play it, cut with **Split (✂)**, drag clips to move them, and drag their edges to trim. With **Snap** on, clip edges stick to each other.\n4. Use tools such as **Transition**, **Auto Stitch**, **AI Detect** and **Group / Stitch** where needed.\n5. Pick a render type at the top and press **⏺ Render**: the whole timeline is rendered with ffmpeg and **registered in the gallery**.\nSave the project with **☰ Menu → 💾 Save Project** and load it again later."
   }
  },
  {
   "h": {
    "ko": "☰ Menu",
    "en": "☰ Menu"
   },
   "body": {
    "ko": "• **📁 Project Library…** — 저장해 둔 프로젝트 목록(Ctrl+P).\n• **＋ New Project** / **📂 Load Project** / **💾 Save Project**(Ctrl+S).\n• **⚙ Project Settings** — 이 프로젝트의 FPS와 총 길이(아래 \"프로젝트 설정\").\n• **🖥 App Settings** — 앱 전체 설정(갤러리 경로, 노드 스킨).\n내보내기와 \"ComfyUI로 보내기\" 메뉴는 이 노드에 없습니다. 최종 결과는 **Render**가 갤러리에 등록합니다.",
    "en": "• **📁 Project Library…** — the list of saved projects (Ctrl+P).\n• **＋ New Project** / **📂 Load Project** / **💾 Save Project** (Ctrl+S).\n• **⚙ Project Settings** — this project's FPS and total length (see \"Project settings\").\n• **🖥 App Settings** — app-wide settings (gallery path, node skin).\nThere are no Export or \"Send to ComfyUI\" items in this node; **Render** registers the final result in the gallery."
   },
   "img": {
    "src": "img/itda-menu.png",
    "cap": {
     "ko": "☰ Menu 드롭다운",
     "en": "The ☰ Menu dropdown"
    }
   }
  },
  {
   "h": {
    "ko": "Media Bin",
    "en": "Media Bin"
   },
   "body": {
    "ko": "• **+ Video (Upload)** / **+ Audio (Upload)** — 이 컴퓨터의 파일을 올립니다.\n• **🎞 Video (Gallery)** — H3·LTX **영상 갤러리**에서 골라 가져옵니다. **🎵 Audio (Gallery)** — **MusicMaker 플레이리스트**에서 골라 가져옵니다. 고른 파일은 프로젝트 전용 미디어 폴더로 복사됩니다.\n• **▦ / ☰** — 썸네일 보기와 목록 보기. **Clear** — 빈을 비웁니다.\n• 카드에는 썸네일(또는 오디오 표시), 파일 이름, 종류와 FPS가 보이고, 카드의 ✕로 빼며, 더블클릭하면 프리뷰에서 미리 봅니다.\n• 아래 슬라이더로 썸네일 크기를 바꾸고, 왼쪽에는 개수(\"2 items\")가 표시됩니다.\n이 노드의 빈은 **영상과 오디오만** 받습니다(이미지·텍스트 클립은 없음).",
    "en": "• **+ Video (Upload)** / **+ Audio (Upload)** — upload files from this computer.\n• **🎞 Video (Gallery)** — pick from the H3 / LTX **video gallery**. **🎵 Audio (Gallery)** — pick from the **MusicMaker playlist**. The chosen file is copied into the project's own media folder.\n• **▦ / ☰** — thumbnail view and list view. **Clear** empties the bin.\n• A card shows its thumbnail (or an audio mark), file name, type and FPS; its ✕ removes it and a double-click previews it in the preview.\n• The slider below changes the thumbnail size, and the count (\"2 items\") is on the left.\nThe bin in this node takes **video and audio only** (no image or text clips)."
   }
  },
  {
   "h": {
    "ko": "프리뷰와 재생",
    "en": "Preview and playback"
   },
   "body": {
    "ko": "• **보기 방식** — **Single**(기본), **Compare / Overlay / Wipe**. 이 셋은 **클립 두 개를 선택했을 때만** 켜지고, 두 클립을 나란히 비교하거나(Compare), 겹쳐 보거나(Overlay), 가운데 막대를 끌어 가르며(Wipe) 봅니다. 단축키 `1`~`4`.\n• **▣ Snapshot**(`P`) — 현재 프레임을 저장합니다. **⛶ Full Screen**(`F`).\n• **재생 컨트롤** — `◀|` 선택한 클립의 시작으로, `◀◀` `◀` 5프레임/1프레임 뒤로, ▶ 재생·일시정지(Space), `▶` `▶▶` 1프레임/5프레임 앞으로, `|▶` 선택한 클립의 끝으로. **Loop**(`L`), **Mute**(`M`), **Scrub**(`A`, 끄고 켜는 스크럽 소리), **Vol** 음량.\n• 아래 표시줄에 현재 **Frame**과 시간, 프로젝트 **FPS**와 **Total** 프레임이 나옵니다.",
    "en": "• **View modes** — **Single** (default) and **Compare / Overlay / Wipe**. The last three turn on **only when two clips are selected**: compare the two side by side (Compare), see them stacked (Overlay) or split them with a draggable bar (Wipe). Shortcuts `1`–`4`.\n• **▣ Snapshot** (`P`) saves the current frame. **⛶ Full Screen** (`F`).\n• **Transport** — `◀|` to the selected clip's start, `◀◀` `◀` back 5 / 1 frames, ▶ play / pause (Space), `▶` `▶▶` forward 1 / 5 frames, `|▶` to the selected clip's end. **Loop** (`L`), **Mute** (`M`), **Scrub** (`A`, scrub sound on / off) and **Vol**.\n• The readout shows the current **Frame** and time, and the project **FPS** and **Total** frames."
   }
  },
  {
   "h": {
    "ko": "타임라인과 레인",
    "en": "Timeline and lanes"
   },
   "body": {
    "ko": "• 레인은 **T1 · T2 · T3** 세 개입니다. 영상 클립을 다른 레인에 겹쳐 놓으면 그 구간을 아래 \"전환\"으로 이을 수 있습니다.\n• 레인 왼쪽의 **👁**는 그 레인을 보이기/숨기기, **🔓/🔒**는 레인을 잠그거나 푸는 버튼입니다. 잠근 레인의 클립은 움직이지 않습니다.\n• 눈금자를 클릭하거나 끌면 재생 위치(빨간 선)가 움직입니다. **I** / **O**로 구간의 시작/끝을 표시하고(`Alt+X`로 해제) 이 구간은 프리 렌더 등에 쓰입니다.\n• **↔** 슬라이더는 가로 확대, **↕**는 레인 높이입니다(`=` `-` 키로도 가로 확대). 드래그로 박스 선택해 여러 클립을 고를 수 있고 복사·붙여넣기도 됩니다.\n• 클립은 이름, 어떤 구간(\"0f to 93f\")을 쓰는지, 소리 파형을 보여 줍니다.",
    "en": "• There are three lanes **T1 · T2 · T3**. Video clips placed on different lanes so that they overlap can be joined with a transition (see \"Transitions\").\n• **👁** at the left of a lane shows / hides it, and **🔓/🔒** locks / unlocks it. Clips on a locked lane do not move.\n• Click or drag the ruler to move the playhead (the red line). **I** / **O** mark the start / end of a range (`Alt+X` clears it); the range is used by Pre-render and similar tools.\n• The **↔** slider zooms horizontally and **↕** sets the lane height (the `=` and `-` keys also zoom). Drag to box-select several clips; copy and paste work too.\n• A clip shows its name, which part of the source it uses (\"0f to 93f\") and its sound waveform."
   }
  },
  {
   "h": {
    "ko": "도구 줄",
    "en": "The tool row"
   },
   "body": {
    "ko": "마우스를 올리면 아이콘 이름이 나옵니다. 왼쪽부터:\n| 아이콘 | 이름 | 하는 일 |\n|---|---|---|\n| ⏮ ⏭ | Mark In / Out (`I` `O`) | 구간의 시작과 끝을 현재 위치로 표시 |\n| ⊘ | Clear Range | 구간 표시 해제 |\n| 🧲 | Snap (`S`) | 클립 가장자리가 서로 달라붙게 함 |\n| 〜 | Peak Match | 오디오 파형의 피크(박자, 타격음)에도 클립 가장자리가 달라붙게 함 |\n| ✂ | Split (`C`) | 재생 위치에서 선택한 클립을 둘로 자름 |\n| 🧵 | Stitch (`Shift+M`) | 선택한 클립 여러 개를 하나의 **Stitched Clip**(레이어 묶음)으로 만듦 |\n| 🪢 | UnStitch (`Shift+U`) | Stitched Clip을 원래 클립들로 되돌림 |\n| 🪄 | Auto Stitch | 영상 클립 2개를 골라 가장 자연스러운 이음 지점을 분석 |\n| 🎞 Transition | Transition | 인접한 영상 클립 2개 사이에 전환을 넣음 |\n| ✨ | AI Detect | 선택한 클립의 장면 전환 / 비트를 감지 |\n| 🔗 / ⛓️‍💥 | Group / Ungroup (`G` / `Shift+G`) | 클립을 묶어 함께 움직이게 / 해제 |\n| 🔈⊘ | Detach Audio (`D`) | 영상에서 소리를 분리해 오디오 클립으로 만듦 |\n| 🔈+ | Merge Audio | 분리했던 소리를 다시 합침 |\n| Pre-render ⏩ | Pre-render (`R`) | 구간을 하나의 파일로 미리 합성해 부드럽게 재생 |\n| 🗑 | Clip Delete (`Del`) | 선택한 클립 삭제 |\n| ▤ Properties | Properties | 오른쪽 Clip Properties 열기/닫기 |\n| ⇤ ⇥ | 처음/끝 프레임으로 | 타임라인의 첫 프레임, 프로젝트 끝 프레임으로 이동 |\n🪄 Auto Stitch, Transition, ✨ AI Detect는 조건이 맞을 때(클립 선택)에만 켜집니다.",
    "en": "Hover an icon to see its name. From the left:\n| Icon | Name | What it does |\n|---|---|---|\n| ⏮ ⏭ | Mark In / Out (`I` `O`) | mark the start and end of a range at the current position |\n| ⊘ | Clear Range | remove the range mark |\n| 🧲 | Snap (`S`) | clip edges stick to each other |\n| 〜 | Peak Match | clip edges also stick to peaks of the audio waveform (beats, transients) |\n| ✂ | Split (`C`) | cut the selected clip in two at the playhead |\n| 🧵 | Stitch (`Shift+M`) | combine several selected clips into one **Stitched Clip** (a layer container) |\n| 🪢 | UnStitch (`Shift+U`) | turn a Stitched Clip back into its clips |\n| 🪄 | Auto Stitch | pick two video clips and analyse the best join point |\n| 🎞 Transition | Transition | insert a transition between two adjacent video clips |\n| ✨ | AI Detect | detect scene changes / beats in the selected clip |\n| 🔗 / ⛓️‍💥 | Group / Ungroup (`G` / `Shift+G`) | tie clips so they move together / release them |\n| 🔈⊘ | Detach Audio (`D`) | split the sound of a video into an audio clip |\n| 🔈+ | Merge Audio | put the detached sound back |\n| Pre-render ⏩ | Pre-render (`R`) | composite a range into one file for smooth playback |\n| 🗑 | Clip Delete (`Del`) | delete the selected clip |\n| ▤ Properties | Properties | open / close Clip Properties on the right |\n| ⇤ ⇥ | first / last frame | jump to the first frame of the timeline or the project's last frame |\n🪄 Auto Stitch, Transition and ✨ AI Detect are enabled only when the right clips are selected."
   }
  },
  {
   "h": {
    "ko": "Clip Properties",
    "en": "Clip Properties"
   },
   "body": {
    "ko": "**▤ Properties**로 여는 오른쪽 패널에서 선택한 클립의 값을 직접 고칩니다.\n• **Clip** — Name, Type(video / audio / image / text), Lane.\n• **Timing** — **Start**(타임라인에서 시작 프레임), **Length**(길이), **Trim In / Trim Out**(소스의 어느 구간을 쓰는지).\n• **Audio**(영상·오디오 클립) — Audio 켜기/끄기, **Solo**, **Gain %**(0~200).\n• **Transition In**(영상 클립) — 전환 종류와 **Frames**(0 = 자동). 이 클립의 머리를 그 아래 레인에서 겹치는 클립의 끝과 섞습니다. 다른 레인으로 끌어 올려 겹치게 놓아야 합니다.\n• **Versions** — 한 클립에 대안 버전을 여러 개 두고(**+ Add Version**) 활성 버전을 바꾸며, **Compare (Wipe)** 로 두 버전을 비교합니다.",
    "en": "In the right panel opened with **▤ Properties** you edit the selected clip's values directly.\n• **Clip** — Name, Type (video / audio / image / text), Lane.\n• **Timing** — **Start** (start frame on the timeline), **Length**, **Trim In / Trim Out** (which part of the source is used).\n• **Audio** (video and audio clips) — Audio on / off, **Solo**, **Gain %** (0–200).\n• **Transition In** (video clips) — the transition type and **Frames** (0 = auto). It blends this clip's head with the tail of the clip it overlaps on another lane, so drag the clip onto a different lane so that they overlap.\n• **Versions** — keep several alternative versions of one clip (**+ Add Version**), switch the active one, and use **Compare (Wipe)** to compare two versions."
   },
   "img": {
    "src": "img/itda-props.png",
    "cap": {
     "ko": "▤ Properties를 연 모습(오른쪽 Clip Properties)",
     "en": "With ▤ Properties open (Clip Properties on the right)"
    }
   }
  },
  {
   "h": {
    "ko": "전환 (Transition)",
    "en": "Transitions"
   },
   "body": {
    "ko": "겹치는 두 영상 클립 사이(또는 Transition In)에 쓸 수 있는 종류: **None (Hard Cut)**, **Dissolve (Cross Fade)**, **Fade to Black**, **Fade to White**, **Wipe Left / Right / Up / Down**, **Slide Left / Right / Up / Down**, **Circle Open / Close** 등. 인접한 영상 클립 두 개를 선택하고 **🎞 Transition**을 누르면 이음매에 넣습니다. 길이는 Frames로 정하며 0이면 자동입니다.",
    "en": "Types available between two overlapping video clips (or as Transition In): **None (Hard Cut)**, **Dissolve (Cross Fade)**, **Fade to Black**, **Fade to White**, **Wipe Left / Right / Up / Down**, **Slide Left / Right / Up / Down**, **Circle Open / Close** and more. Select two adjacent video clips and press **🎞 Transition** to insert one at the join. The length is set in Frames; 0 means automatic."
   }
  },
  {
   "h": {
    "ko": "Auto Stitch",
    "en": "Auto Stitch"
   },
   "body": {
    "ko": "영상 클립 **두 개**를 시간 순서대로 선택하고 🪄를 누르면, 앞 클립의 끝과 뒤 클립의 머리를 비교해 **가장 자연스럽게 이어지는 자르는 지점**을 찾아 줍니다(예: H3 클립을 이어 만들 때 겹치는 부분 정리). **Analysis window (sec)**(기본 2초)를 정하고 **Analyze**를 누르면 프레임과 소리를 분석한 뒤 후보 목록을 보여 주고, 마음에 드는 후보를 **Apply**해야만 타임라인이 바뀝니다. 분석만으로는 아무것도 자동으로 고치지 않습니다. 두 클립 모두 소스 파일이 있어야 합니다.",
    "en": "Select **two** video clips in time order and press 🪄: the tail of the first and the head of the second are compared to find the **cut point that joins most naturally** (handy when tidying the overlap of chained H3 clips). Set the **Analysis window (sec)** (default 2) and press **Analyze**; the frames and sound are analysed and a list of candidates appears. The timeline changes only when you **Apply** a candidate you like — the analysis never edits anything by itself. Both clips need a source file."
   }
  },
  {
   "h": {
    "ko": "AI Detect — 장면 · 비트 감지",
    "en": "AI Detect — scenes and beats"
   },
   "body": {
    "ko": "비디오 또는 오디오 클립을 선택하고 ✨를 누릅니다. 이것도 \"추천 후 적용\" 방식이라 감지만으로는 타임라인이 바뀌지 않습니다.\n• **Scene Detect**(영상) — 클립 안의 **장면 전환**을 찾아 각 지점에서 자릅니다. **Sensitivity**(0.10~0.80, 기본 0.30)가 낮을수록 더 많이 잡습니다.\n• **Beat Detect** — 클립 소리의 **템포를 추적해 박자(비트)** 를 타임라인에 표시합니다. 컷을 박자에 맞추고 싶을 때 씁니다.",
    "en": "Select a video or audio clip and press ✨. This too is \"recommend, then apply\" — detection alone does not change the timeline.\n• **Scene Detect** (video) — finds the **shot changes** inside the clip and splits it at each one. A lower **Sensitivity** (0.10–0.80, default 0.30) catches more.\n• **Beat Detect** — tracks the **tempo of the clip's sound** and marks the beats on the timeline. Use it to cut on the beat."
   }
  },
  {
   "h": {
    "ko": "Pre-render",
    "en": "Pre-render"
   },
   "body": {
    "ko": "복잡한 구간(여러 레인, 전환, 자막)은 그대로 재생하면 끊길 수 있습니다. **Pre-render(`R`)** 는 표시한 구간(I/O)을 **하나의 파일로 미리 합성**하고, Single 보기에서 그 파일로 재생합니다. 타임라인을 고치면 미리 합성한 것은 낡은 것으로 취급되어 쓰이지 않습니다. 최종 결과를 만드는 것은 아니며, 최종은 **Render**입니다.",
    "en": "A complex range (several lanes, transitions, captions) may stutter when played as is. **Pre-render (`R`)** composites the marked range (I/O) **into one file** and plays that file in Single view. Once you change the timeline, the pre-rendered file is treated as stale and no longer used. It is not the final output — the final one is made by **Render**."
   }
  },
  {
   "h": {
    "ko": "Render와 갤러리",
    "en": "Render and the gallery"
   },
   "body": {
    "ko": "• **⏺ Render** — 타임라인 **전체**를 렌더해 **갤러리에 등록**합니다. 실제 **ffmpeg**를 쓰므로 ffmpeg가 설치되어 있어야 합니다.\n• 렌더 종류(Render 왼쪽 선택): **Video + Audio**, **Video Only**, **Audio Only**.\n• **🖼 Gallery** — 렌더한 결과를 봅니다. 앱 설정의 **Gallery Path**로 갤러리 폴더를 정합니다(프로젝트가 아닌 앱 전체 설정).",
    "en": "• **⏺ Render** — renders the **whole** timeline and **registers it in the gallery**. It uses real **ffmpeg**, so ffmpeg must be installed.\n• Render types (the selector left of Render): **Video + Audio**, **Video Only**, **Audio Only**.\n• **🖼 Gallery** — view what you rendered. The gallery folder is set by **Gallery Path** in App Settings (an app-wide setting, not per project)."
   }
  },
  {
   "h": {
    "ko": "프로젝트 설정 · 앱 설정",
    "en": "Project settings and App settings"
   },
   "body": {
    "ko": "**⚙ Project Settings**(Ctrl+,) — **Project FPS**(16~120, 60 이상은 경고), **Total Frames**(타임라인 전체 길이), **Frame Policy**(**Normalize to Project FPS** 또는 **Frame Drop / Interpolation**: FPS가 다른 소스를 프로젝트 FPS에 맞추는 방식). FPS나 총 길이를 바꾸면 눈금자와 모든 클립의 위치가 함께 비율에 맞춰 바뀝니다.\n**🖥 App Settings** — **Gallery Path**와 **🎨 Customize Node Skin…**(이 노드의 색). 프로젝트가 아니라 앱 전체에 적용됩니다.",
    "en": "**⚙ Project Settings** (Ctrl+,) — **Project FPS** (16–120; 60 and above is flagged), **Total Frames** (the whole timeline length) and **Frame Policy** (**Normalize to Project FPS** or **Frame Drop / Interpolation** — how a source with a different FPS is fitted to the project FPS). Changing the FPS or length rescales the ruler and every clip's position together.\n**🖥 App Settings** — **Gallery Path** and **🎨 Customize Node Skin…** (this node's colors). They apply app-wide, not per project."
   }
  },
  {
   "h": {
    "ko": "단축키",
    "en": "Keyboard shortcuts"
   },
   "body": {
    "ko": "(타임라인이 선택된 상태에서)\n| 키 | 동작 |\n|---|---|\n| `Space` | 재생 / 일시정지 |\n| `←` `→` | 1프레임 이동 (`Shift` = 5프레임, `Alt` = 처음/끝 프레임) |\n| `I` `O` / `Alt+X` | 구간 시작·끝 표시 / 해제 |\n| `C` | 분할 |\n| `S` | Snap 켜기/끄기 |\n| `G` / `Shift+G` | 그룹 / 그룹 해제 |\n| `Shift+M` / `Shift+U` | Stitch / UnStitch |\n| `D` | 소리 분리 |\n| `R` | Pre-render |\n| `L` / `M` / `A` | Loop / Mute / Scrub |\n| `F` / `P` | 전체 화면 / 스냅샷 |\n| `1` `2` `3` `4` | Single / Compare / Overlay / Wipe (2~4는 클립 2개 선택 시) |\n| `=` `-` | 가로 확대 / 축소 |\n| `Del` | 선택 클립 삭제, `Esc` 선택 해제 |\n| `Ctrl+S` / `Ctrl+P` / `Ctrl+,` | 저장 / 프로젝트 목록 / 프로젝트 설정 |",
    "en": "(with the timeline focused)\n| Key | Action |\n|---|---|\n| `Space` | play / pause |\n| `←` `→` | step 1 frame (`Shift` = 5 frames, `Alt` = first / last frame) |\n| `I` `O` / `Alt+X` | mark range start / end / clear it |\n| `C` | split |\n| `S` | Snap on / off |\n| `G` / `Shift+G` | group / ungroup |\n| `Shift+M` / `Shift+U` | Stitch / UnStitch |\n| `D` | detach audio |\n| `R` | Pre-render |\n| `L` / `M` / `A` | Loop / Mute / Scrub |\n| `F` / `P` | full screen / snapshot |\n| `1` `2` `3` `4` | Single / Compare / Overlay / Wipe (2–4 need two clips selected) |\n| `=` `-` | zoom in / out horizontally |\n| `Del` | delete the selected clip, `Esc` clears the selection |\n| `Ctrl+S` / `Ctrl+P` / `Ctrl+,` | save / project library / project settings |"
   }
  },
  {
   "h": {
    "ko": "기능 한눈에",
    "en": "Features at a glance"
   },
   "body": {
    "ko": "| **편집 / Editing** | 분할 · 그룹 · 스티치 · 스냅 · 박스 선택 · 복사/붙여넣기 · 웨이브폼 · 줌/스크럽 · 전체 화면 |\n| **자동화 / Automation** | Auto Stitch · 장면 감지 · 비트 감지 · 버전 · Pre-render |\n| **미디어 빈 / Media bin** | 로컬 영상·오디오 업로드, 그리고 **H3 영상 갤러리 · MusicMaker 플레이리스트에서 바로 불러오기** |\n| **내보내기 / Export** | 실제 ffmpeg로 스티치 적용·내보내기 (ffmpeg 필요) |",
    "en": "| **편집 / Editing** | split · group · stitch · snap · box-select · copy-paste · waveforms · zoom / scrub · full screen |\n| **자동화 / Automation** | Auto Stitch · scene detect · beat detect · versions · pre-render |\n| **미디어 빈 / Media bin** | local video / audio upload, plus **import straight from the H3 video gallery and the MusicMaker playlist** |\n| **내보내기 / Export** | real ffmpeg stitch apply / export (needs ffmpeg) |"
   }
  },
  {
   "h": {
    "ko": "알아 둘 점",
    "en": "Good to know"
   },
   "body": {
    "ko": "• 별도의 ITDA 노드 팩이 필요 없습니다. 그 코드를 이 패키지에 그대로 흡수했습니다.\n• 렌더와 Auto Stitch, AI Detect는 서버의 **ffmpeg**를 씁니다. ffmpeg가 없으면 동작하지 않습니다.\n• 이 매뉴얼의 단축키와 도구 설명은 노드의 코드에서 확인한 것입니다. 일부 동작(예: 레인 합성 순서, Versions)은 직접 써 보며 확인하세요.",
    "en": "• No separate ITDA node pack is needed — that code was absorbed into this package as-is.\n• Render, Auto Stitch and AI Detect use the server's **ffmpeg**. They do not work without it.\n• The shortcuts and tool descriptions here were read from the node's code. Try a few behaviours yourself (for example the lane compositing order and Versions) to confirm them."
   }
  }
 ]
});

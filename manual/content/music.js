MANUAL.add({
 "id": "music",
 "title": {
  "ko": "MusicMaker ONE STUDIO",
  "en": "MusicMaker ONE STUDIO"
 },
 "lead": {
  "ko": "노래·연주곡을 만드는 음악 노드. 노드 하나에서 Ace-Step 1.5 · MiniMax Music 3 · YuE2 세 엔진을 바꿔 씁니다.",
  "en": "A music node for songs and instrumentals. One node switches between three engines: Ace-Step 1.5, MiniMax Music 3 and YuE2."
 },
 "sections": [
  {
   "h": {
    "ko": "화면 구성",
    "en": "The screen"
   },
   "body": {
    "ko": "**1. 엔진 탭** (맨 위) — Ace-Step 1.5 · MiniMax Music 3 · YuE2. 오른쪽 위 **Settings**에서 모델과 LLM을 정합니다.\n**2. 왼쪽 작곡 패널** — Simple / Advanced 전환, Title(+ **Cover Info**), **Song / Instrumental** 전환, **Lyrics**(Reset · Preset · Expand · ✨ 버튼과 Intro / Verse / Pre-Chorus / Chorus … 섹션 태그 칩), **Style tags**(Reset · Preset · Reroll · Expand · ✨ 버튼과 스타일 칩), **seed**와 **seed mode**, **Generate / Stop**, **job.json** 내려받기.\n**3. 오른쪽 플레이리스트** — 만든 곡 카드 목록(엔진 표시, 길이, 스타일 설명). 검색창, ★ 즐겨찾기 보기, ↻ 새로고침, 정렬(Newest …), 여러 곡 선택 후 Delete / Clear.\n**4. 맨 아래 플레이어** — 곡을 고르면 재생/일시정지, 이전/다음, 연속 재생 토글, 볼륨.",
    "en": "**1. Engine tabs** (top) — Ace-Step 1.5 · MiniMax Music 3 · YuE2. **Settings** at the top right chooses the models and the LLM.\n**2. Compose panel (left)** — Simple / Advanced switch, Title (+ **Cover Info**), **Song / Instrumental** switch, **Lyrics** (Reset · Preset · Expand · ✨ buttons and section-tag chips such as Intro / Verse / Pre-Chorus / Chorus …), **Style tags** (Reset · Preset · Reroll · Expand · ✨ buttons and style chips), **seed** and **seed mode**, **Generate / Stop** and a **job.json** download.\n**3. Playlist (right)** — cards for the tracks you made (engine badge, length, style description). Search box, ★ favourites, ↻ refresh, sort order (Newest …), and Delete / Clear for a multi-selection.\n**4. Player (bottom)** — pick a track to play: play / pause, previous / next, a continuous-play toggle and volume."
   },
   "img": {
    "src": "img/music-main.png",
    "cap": {
     "ko": "MusicMaker ONE STUDIO (Ace-Step 1.5 탭, 플레이리스트에는 이 PC의 곡이 보입니다)",
     "en": "MusicMaker ONE STUDIO (Ace-Step 1.5 tab; the playlist shows the tracks on this PC)"
    }
   }
  },
  {
   "h": {
    "ko": "엔진 세 가지",
    "en": "The three engines"
   },
   "body": {
    "ko": "| 엔진 | 특징 |\n|---|---|\n| **Ace-Step 1.5** (기본값) | 48 kHz, 깨끗한 고역. BPM·키·박자·언어를 **구조화된 입력**으로 받습니다. 3단계 샘플링(progressive refine)과 JKASS 품질 샘플러(`jkass_quality`)를 써서 `JK-AceStep-Nodes`가 필요합니다. |\n| **MiniMax Music 3** | 구조화된 입력이 없어 BPM·키·박자·보컬을 캡션 텍스트에 녹여 전달합니다. 오디오 VAE가 약 16.5 kHz에서 잘리고 5–12 kHz를 넓은 대역 노이즈로 렌더해 보컬이 \"바람 소리\"처럼 들릴 수 있습니다(모델 특성이며 cfg 문제가 아닙니다). |\n| **YuE2** | 체크포인트 한 파일(모델·CLIP·VAE 포함)로 동작합니다. **Text to Music**(스타일+가사로 작곡, 멜로디 스케치 자동 또는 직접 그린 멜로디 사용)과 **Cover Music**(올린 녹음의 멜로디를 SheetSage2가 악보로 옮기고 그걸 따라 새 곡 생성) 두 모드. 별도 네거티브 프롬프트와 LoRA 슬롯이 없습니다. 스텝은 32로 고정입니다. |",
    "en": "| Engine | Notes |\n|---|---|\n| **Ace-Step 1.5** (default) | 48 kHz, clean highs. BPM / key / time signature / language are **structured inputs**. It uses 3-stage progressive-refine sampling and the JKASS quality sampler (`jkass_quality`), so it needs `JK-AceStep-Nodes`. |\n| **MiniMax Music 3** | No structured fields — BPM / key / time signature / vocals are folded into the caption text. The audio VAE brick-walls at about 16.5 kHz and renders 5–12 kHz as broadband noise, so vocals can sound \"windy\" (a model trait, not a cfg artifact). |\n| **YuE2** | Runs from one checkpoint file (model + CLIP + VAE). Two modes: **Text to Music** (compose from style + lyrics, with an auto-sketched or a hand-made melody) and **Cover Music** (SheetSage2 transcribes an uploaded recording's melody and a new song follows it). No separate negative prompt and no LoRA slot. Steps are fixed at 32. |"
   }
  },
  {
   "h": {
    "ko": "작곡 패널",
    "en": "Compose panel"
   },
   "body": {
    "ko": "• **Style** — 스타일 캡션입니다. 짧게 쓰면 ✨로 길게 확장하고, **Reroll**로 다른 표현으로 다시 씁니다.\n• **Lyrics** — `[Verse]` `[Chorus]` 태그가 있는 가사입니다. 비워 두면 제목과 브리프에서 ✨로 작성합니다. **Song / Instrumental** 토글에서 Instrumental을 고르면 가사·보컬 섹션이 숨겨지고 가사 없이 만듭니다.\n• **Vocals** — gender / delivery / tone. `auto`가 아니면 캡션에 반영됩니다(✨나 Reroll을 누르지 않아도 그래프를 만들 때 적용).\n• **BPM · key · time signature · Length** — Ace-Step은 구조화된 입력, MiniMax는 캡션 힌트입니다. 브리프에 `3:00` 또는 `3분`이 있으면 슬라이더보다 우선합니다.\n• **Advanced** — MiniMax: steps · sampler cfg · **guidance(cfg_scale, 텍스트 인코더 별도 조절)** · top_k · tiled decode. Ace-Step: cfg_scale · temperature · top_p / min_p / top_k · shift · **샘플링 스테이지**(1단계는 항상, 2·3단계는 체크박스. 3은 2가 켜져 있어야 활성).\n• **LoRA** — 최대 3개(`LoraLoaderModelOnly` 체인), 두 엔진 공통입니다.",
    "en": "• **Style** — the style caption. When it is short, ✨ expands it; **Reroll** rewrites it in different words.\n• **Lyrics** — lyrics with `[Verse]` / `[Chorus]` tags. Leave it empty and ✨ writes lyrics from the title and brief. With **Instrumental** chosen in the **Song / Instrumental** toggle the lyrics and vocal sections are hidden and the track is rendered without lyrics.\n• **Vocals** — gender / delivery / tone. Anything other than `auto` is folded into the caption (applied when the graph is built, even if you never press ✨ or Reroll).\n• **BPM · key · time signature · Length** — structured inputs for Ace-Step, caption hints for MiniMax. A `3:00` or `3 min` in the brief wins over the slider.\n• **Advanced** — MiniMax: steps · sampler cfg · **guidance (cfg_scale, a separate knob for the text encoder)** · top_k · tiled decode. Ace-Step: cfg_scale · temperature · top_p / min_p / top_k · shift · **sampling stages** (stage 1 always, stages 2 and 3 are checkboxes; 3 needs 2 on).\n• **LoRA** — up to 3 (a `LoraLoaderModelOnly` chain), shared by both engines."
   }
  },
  {
   "h": {
    "ko": "Melody Editor (YuE2 · Text to Music)",
    "en": "Melody Editor (YuE2 · Text to Music)"
   },
   "body": {
    "ko": "작곡 패널의 **Melody** 섹션에서 `🎹 Open Melody Editor…`를 누르면 피아노롤이 열립니다.\n• **입력** — **✎ Pen**으로 노트를 그립니다(드래그로 이동·길이 조절, 우클릭/더블클릭/Del로 삭제, 박스 선택, 복사·붙여넣기, 방향키, Quantize, Undo/Redo). **● 녹음**으로 연주해서 입력할 수도 있습니다.\n• **실물 MIDI 건반** — `🎛 Connect MIDI`에서 장치를 고릅니다(All / 개별, ↻ 재검색, 핫플러그, 마지막 장치 기억, 활동 LED). 브라우저의 Web MIDI를 쓰므로 **Chrome / Edge**에서 동작하고, 처음 한 번 접근 허용이 필요하며, 건반은 브라우저를 여는 PC에 연결해야 합니다.\n• **컴퓨터 키보드** — `Z–M` / `Q–P`가 건반, `[` `]`가 옥타브입니다. 녹음은 카운트인(0/1/2마디), 메트로놈, 루프, 입력 Quantize를 지원하고, 누르는 동안 노트가 실시간으로 길어지며, 소리가 귀에 닿는 출력 지연을 보정합니다.\n• **건반 소리** — 내장 신디사이저, 또는 직접 올린 음원 파일(wav 등)을 **샘플 악기**로 씁니다(루트 노트 기준으로 음높이를 옮겨 재생, 루트는 파일명/오디오로 자동 감지, 브라우저에 저장).\n• **MIDI 파일** — 가져오기(여러 트랙이면 선택)와 내보내기. BPM · 박자(4/4, 3/4, 6/8 …) · 조 · 마디 수를 설정합니다.\n• **적용** — ✓ Apply Melody를 누르면 \"Use my melody\"가 켜지고, 멜로디는 단선율 ABC 악보(마지막 노트가 있는 마디까지)로 `YuE2GenerateMusic`에 `melody` 모드로 전달됩니다. 코드(동시 음)는 한 음(최고음/최저음 선택)으로 줄여지고, 곡 길이는 Length 슬라이더가 아니라 멜로디 길이를 따릅니다.",
    "en": "Open the **Melody** section in the compose panel and press `🎹 Open Melody Editor…` to get the piano roll.\n• **Input** — draw notes with **✎ Pen** (drag to move / resize, right-click / double-click / Del to delete, box select, copy-paste, arrow keys, Quantize, Undo/Redo), or play them in with **● Record**.\n• **Real MIDI keyboard** — pick a device under `🎛 Connect MIDI` (All / one, ↻ rescan, hot-plug, remembers the last device, activity LED). It uses the browser's Web MIDI, so it works in **Chrome / Edge**, asks for access once, and the keyboard must be plugged into the PC running the browser.\n• **Computer keyboard** — `Z–M` / `Q–P` are keys, `[` `]` change the octave. Recording has a count-in (0/1/2 bars), a metronome, loop and input quantize; notes grow while a key is held, and output latency is compensated.\n• **Sound** — the built-in synth, or an audio file (wav, …) loaded as a **sample instrument** (pitch-shifted from its root note, auto-detected from the file name / audio, stored in the browser).\n• **MIDI files** — import (pick tracks) and export. BPM · meter (4/4, 3/4, 6/8 …) · key · bars are editable.\n• **Apply** — ✓ Apply Melody turns on \"Use my melody\" and sends a single-line ABC score (up to the bar of the last note) to `YuE2GenerateMusic` in `melody` mode. Chords are reduced to one note (highest / lowest), and the song length follows the melody, not the Length slider."
   }
  },
  {
   "h": {
    "ko": "대기 큐",
    "en": "Generation queue"
   },
   "body": {
    "ko": "• **▶ Generate**를 누르면 패널 전체를 스냅샷하고 플레이리스트 맨 위에 작업 카드가 추가됩니다. 워커 하나가 먼저 들어온 순서대로 처리합니다(ComfyUI가 실제 실행을 직렬화합니다).\n• 카드의 ✕ — 대기 중이면 큐에서 빼고, 실행 중이면 `/interrupt` 후 다음 작업으로 넘어갑니다. **Stop**은 큐 전체를 비웁니다.\n• 누른 뒤에 패널을 고쳐도 이미 스냅샷된 작업에는 반영되지 않습니다.",
    "en": "• **▶ Generate** snapshots the whole panel and adds a job card at the top of the playlist. One worker drains the queue first-in, first-out (ComfyUI serialises the actual runs).\n• ✕ on a card — removes it from the queue while waiting, or sends `/interrupt` and moves on to the next job while running. **Stop** empties the whole queue.\n• Editing the panel after you pressed Generate does not change a job that has already been snapshotted."
   }
  },
  {
   "h": {
    "ko": "LLM (캡션 · 가사)",
    "en": "LLM (captions and lyrics)"
   },
   "body": {
    "ko": "• 백엔드 4종: **Local GGUF**(`ComfyUI-TJ_NODE`), **OpenRouter**(클라우드), **ComfyUI TextGenerate**, **Connect Custom**(OpenAI 호환 서버, URL·모델·컨텍스트 지정). Settings에서 고릅니다.\n• 가사를 쓸 때 실제 곡 길이를 전달하고, 프롬프트에 길이별 구조표가 들어 있어 3분 곡이 20초짜리 가사로 나오지 않습니다.\n• OpenRouter의 reasoning 모델이 `finish_reason=length`로 빈 응답을 주면 토큰을 2배로 하고 reasoning을 포함해 한 번 다시 시도해 답을 꺼냅니다. reasoning 모델이 계속 실패하면 non-reasoning 모델을 권하는 메시지가 나옵니다.",
    "en": "• Four backends: **Local GGUF** (`ComfyUI-TJ_NODE`), **OpenRouter** (cloud), **ComfyUI TextGenerate** and **Connect Custom** (an OpenAI-compatible server — set the URL, model and context). Pick one in Settings.\n• Lyric writing is given the real song length and the prompt contains a length-based structure table, so a 3-minute song does not come back with 20 seconds of lyrics.\n• If an OpenRouter reasoning model returns an empty answer with `finish_reason=length`, the request is retried once with doubled tokens and reasoning included, and the answer is extracted. If a reasoning model keeps failing you get a message recommending a non-reasoning model."
   }
  },
  {
   "h": {
    "ko": "플레이리스트",
    "en": "Playlist"
   },
   "body": {
    "ko": "• 인라인 플레이어(재생/일시정지, 다음/이전, single/continuous 토글), 즐겨찾기, 트랙별 **Info**(엔진·길이·시드·사용 LLM·파라미터)와 **Reuse**(그 곡의 설정을 패널로 되돌림).\n• **태그** — 생성 직후, 그리고 제목·가사·커버를 바꿀 때마다 ffmpeg(스트림 복사, 재인코딩 없음)로 **저장된 파일 자체**에 제목·아티스트·앨범·스타일 코멘트·엔진·전체 가사·시드·커버 아트가 들어갑니다(FLAC/MP3, Opus는 커버 제외). 이전에 만든 곡은 메타를 다시 저장하면 채워집니다.\n• **↓ Download** — 그 파일을 변환 없이 그대로 내려받습니다(확장자도 원본 그대로).\n• **↻ Refresh** — 다른 세션이나 웹앱에서 추가·삭제된 곡을 노드를 다시 불러오지 않고 반영합니다.\n• **커버** — `Auto-generate album cover (Krea2)`가 기본으로 켜져 있습니다. `⋯ → Regenerate cover`에서 Auto(제목+가사) 또는 Prompt(직접 설명 → LLM → Krea2 프롬프트)를 고릅니다. `⋯ → Cover Image Copy / Paste / Upload / From Gallery`로 이미 있는 커버를 다른 트랙에 붙여넣거나(여러 곡을 선택하면 전체에 적용), 이미지를 올리거나, 이미지 노드 갤러리에서 골라 정사각형으로 잘라 쓸 수 있습니다. 작곡 패널의 **Use my own cover image**를 지정하면 이후 생성되는 곡은 Krea2 대신 그 커버를 씁니다.\n• **저장 폴더** — Settings에서 정하고, 저장 위치와 플레이리스트 스캔에 모두 반영됩니다.\n• **눈가리기** — 각 커버의 👁 토글(서버에 공유되는 목록).\n• **iOS Safari** — 탭하면 바로 재생하고, FLAC을 브라우저가 못 읽으면 `/music_one/download`의 MP3로 대신합니다.",
    "en": "• Inline player (play / pause, next / previous, single / continuous toggle), favourites, and per-track **Info** (engine · length · seed · LLM used · parameters) and **Reuse** (puts that track's settings back into the panel).\n• **Tags** — right after generation, and whenever you change the title, lyrics or cover, ffmpeg (stream copy, no re-encode) writes the title, artist, album, style comment, engine, full lyrics, seed and cover art into **the saved file itself** (FLAC / MP3; Opus gets no cover). Tracks made earlier get their metadata filled in when you save it again.\n• **↓ Download** — gives you that file as it is, without conversion (same extension).\n• **↻ Refresh** — picks up tracks added or deleted from another session or the web app without reloading the node.\n• **Cover** — `Auto-generate album cover (Krea2)` is on by default. `⋯ → Regenerate cover` offers Auto (title + lyrics) or Prompt (your description → LLM → Krea2 prompt). `⋯ → Cover Image Copy / Paste / Upload / From Gallery` pastes an existing cover onto other tracks (onto all of them when several are selected), uploads an image, or picks one from an image-node gallery and crops it square. Setting **Use my own cover image** in the compose panel makes later tracks use that cover instead of Krea2.\n• **Save folder** — set in Settings; it applies to both where files are saved and what the playlist scans.\n• **Hide covers** — a 👁 toggle on each cover (a list shared on the server).\n• **iOS Safari** — plays synchronously on tap, and when the browser cannot read FLAC it falls back to the MP3 from `/music_one/download`."
   }
  },
  {
   "h": {
    "ko": "필요한 노드",
    "en": "Required and optional custom nodes"
   },
   "body": {
    "ko": "| 노드 | 용도 | 없으면 |\n|---|---|---|\n| ComfyUI 코어 | `MiniMaxMusic3TextEncode` · `EmptyMiniMaxMusic3LatentAudio` · `TextEncodeAceStepAudio1.5` · `EmptyAceStep1.5LatentAudio` · `ModelSamplingAuraFlow` · `KSamplerSelect` · `BasicScheduler` · `SamplerCustom` · `VAEDecodeAudio` · `SaveAudioAdvanced` · `YuE2GenerateABC` · `YuE2GenerateMusic` · `EmptyYuE2LatentAudio` · `SheetSage2AudioToABC` | **필수** (최신 ComfyUI 필요) |\n| [JK-AceStep-Nodes](https://github.com/jeankassio/JK-AceStep-Nodes) | JKASS 품질 샘플러 (`jkass_quality`) | Ace-Step 엔진의 기본 샘플러 실패 — Settings에서 다른 샘플러로 바꾸거나 설치 |\n| [ComfyUI-Openrouter_node](https://github.com/gabe-init/ComfyUI-Openrouter_node) | OpenRouter LLM 키 저장소 (선택) | OpenRouter LLM 백엔드만 비활성 (로컬·TextGenerate는 정상) |\n| ComfyUI-TJ_NODE | 로컬 GGUF LLM · `TextGenerate` · `TJ_MultiImageLoader` | 로컬 LLM 백엔드만 비활성 (OpenRouter는 정상) |",
    "en": "| Node | Purpose | If missing |\n|---|---|---|\n| ComfyUI core | `MiniMaxMusic3TextEncode` · `EmptyMiniMaxMusic3LatentAudio` · `TextEncodeAceStepAudio1.5` · `EmptyAceStep1.5LatentAudio` · `ModelSamplingAuraFlow` · `KSamplerSelect` · `BasicScheduler` · `SamplerCustom` · `VAEDecodeAudio` · `SaveAudioAdvanced` · `YuE2GenerateABC` · `YuE2GenerateMusic` · `EmptyYuE2LatentAudio` · `SheetSage2AudioToABC` | required (recent ComfyUI) |\n| [JK-AceStep-Nodes](https://github.com/jeankassio/JK-AceStep-Nodes) | JKASS quality sampler | the Ace-Step engine's default sampler fails — pick another in Settings, or install it |\n| [ComfyUI-Openrouter_node](https://github.com/gabe-init/ComfyUI-Openrouter_node) | OpenRouter LLM key store (optional) | only the OpenRouter LLM backend is disabled |\n| ComfyUI-TJ_NODE | local GGUF LLM path | only the local LLM backend is disabled |"
   }
  },
  {
   "h": {
    "ko": "필요한 모델",
    "en": "Required models"
   },
   "body": {
    "ko": "Ace-Step 1.5와 MiniMax Music 3 모델은 각자의 배포처에서 받아 `models/` 아래에 두고 Settings에서 지정합니다(Diffusion / Text Encoder(들) / Audio VAE). 엔진마다 필요한 파일이 다릅니다.\n**YuE2**는 체크포인트 한 파일(`models/checkpoints/`, 예: `yue2_3b_int8_convrot.safetensors`, 모델·CLIP·VAE 포함)을 Settings의 YuE2 탭에서 지정하고, **Cover Music**에는 추가로 SheetSage2 오디오 인코더(`models/audio_encoders/sheetsage2_bf16.safetensors`)가 필요합니다.",
    "en": "Download the Ace-Step 1.5 and MiniMax Music 3 model files from their own distributions, place them under `models/`, and pick them in Settings (Diffusion / Text Encoder(s) / Audio VAE). Which files you need depends on the engine.\n**YuE2** needs one checkpoint file (in `models/checkpoints/`, e.g. `yue2_3b_int8_convrot.safetensors`, containing model + CLIP + VAE) picked in Settings → YuE2; **Cover Music** additionally needs the SheetSage2 audio encoder (`models/audio_encoders/sheetsage2_bf16.safetensors`)."
   }
  }
 ]
});

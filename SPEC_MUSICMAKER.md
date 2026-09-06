# SPEC — MusicMaker ONE STUDIO (TJ)

STUDIO_ONE 페밀리의 **세 번째 축**: 영상(MiniMax H3) / 이미지(Klein·Krea2·Qwen·SDXL·Z-Image·Anima) 다음으로 **음악**.
작성 경위: 이 repo(`ComfyUI-TJ_NODE_STUDIO_ONE`) 세션에서 사용자와 설계 확정. 구현 노드 우선, 웹(`AI_One_Studio`) 미러.

## ★ 엔진 축 — 한 노드, 두 모델

노드 상단 드롭다운으로 **엔진** 선택 (`state.engine`):

| engine | 텍스트 인코드 | 로더 | 샘플러 | 고유 파라미터 |
|---|---|---|---|---|
| **`minimax`** — MiniMax Music 3 | `MiniMaxMusic3TextEncode` (caption, lyrics, seed, max_duration, cfg_scale 1.7, top_k 50) | `CLIPLoader`(minimax) + UNETLoader + VAELoader | `KSampler` 1회 (steps 30, cfg 1.7, euler/simple) | max_duration, cfg_scale, top_k, tiled decode |
| **`acestep`** — Ace-Step 1.5 (사용자 `Ace-Step-1.5_3xSampler.json` 워크플로) | `TextEncodeAceStepAudio1.5` (tags, lyrics, seed, bpm, duration, timesignature, language, keyscale, generate_audio_codes, cfg_scale 2.5, temperature 0.75, top_p 0.9, top_k, min_p) | UNETLoader + [LoRA] + `ModelSamplingAuraFlow`(shift 3) + `DualCLIPLoader`(ace) + VAELoader | `KSamplerSelect`(jkass_quality) + **3× `SamplerCustom`** 점진 리파인 (30@cfg0 → 20@cfg1 → 15@cfg1, `BasicScheduler` sgm_uniform) | bpm, key/scale, timesig, language, temperature, top_p, min_p, shift, 3-stage steps/cfg |

**공유**: 가사 박스 + 스타일 박스 + ✨ LLM (6개 역할) + 플레이리스트 + 하단 플레이어 바 + 항목별 📚 프리셋 + 앨범 커버(Krea2) + Reuse/Info/Download/멀티삭제.
**엔진별로 갈리는 것만**: 위 표 (로더 / 텍스트인코드 / 샘플러 체인 / 추가옵션 / Settings 모델 슬롯).

노드 클래스 `MusicMakerOneTJNode`, 라우트 `/music_one/*`, 서브폴더 `output/one_music/`, 웹 디렉토리 `web/music/`.

---

아래 "기술" 항목은 ComfyUI 0.34.2 소스를 직접 열어 확인한 것.

---

## 0. 핵심 성격

**이 노드는 LLM이 하는 비중이 가장 큰 노드다.** H3 노드의 ✨는 "프롬프트 다듬기" 정도였지만,
여기선 가사·음악 스타일·앨범 커버 프롬프트·트랙 제목까지 사실상 LLM이 다 만든다.
사용자는 대략적인 아이디어만 던지고 나머지는 LLM이 채운다.

사용자 명시 예시 (가사 박스에 이렇게 써도 가사가 나와야 함):
- `슬픈 이별 이야기로 1분짜리 가사`
- `음~~~음~~~ 너를 미워해~~~ 이런 느낌의 가사 1분 짜리`
- (완성된 `[Verse]...[Chorus]...` 가사) → 이건 인핸스만

---

## 1. 기술 — ComfyUI 0.34.2 네이티브 MiniMax Music 3

**커스텀 팩 불필요.** 코어에 이미 들어있음:
- `comfy/ldm/minimax_music/` (dit / ar / dav / prompt)
- `comfy/text_encoders/minimax_music.py`
- `comfy_extras/nodes_minimax_music.py`
- `supported_models.py`: `MiniMaxMusic3` — audio_model `minimax_music3`, `latent_format = MiniMaxMusic3`, **ModelType.FLOW** (flow matching), `sampling_settings = {"multiplier": 1.0}`, `memory_usage_factor = 2.0`

### 사용자가 이미 받은 모델
| 슬롯 | 파일 | 로더 |
|---|---|---|
| DiT (UNET) | `Minimax-Music\minimax_music3_dit_fp32.safetensors` | `UNETLoader` |
| Audio VAE (DAV) | `minimax_music3_dav.safetensors` | `VAELoader` |
| Text encoder | `minimax_music3_text_encoder_pruned_int8_convrot.safetensors` | `CLIPLoader` (type `minimax_music`) |

### 코어 노드
| 노드 | 입력 | 출력 |
|---|---|---|
| `MiniMaxMusic3TextEncode` | clip, **caption** (multiline), **lyrics** (multiline), seed, max_duration (0.04 ~ `MAX_AUDIO_FRAMES/AUDIO_FRAMES_PER_SECOND` s), cfg_scale (기본 `CFG_SCALE`), top_k (기본 `CFG_TOP_K`) | CONDITIONING, **seconds** (float) |
| `EmptyMiniMaxMusic3LatentAudio` | seconds, batch_size (1~4096) | LATENT (`type:"audio"`, `downscale_ratio_temporal:512`) |

> `MiniMaxMusic3TextEncode`가 무겁다 — `clip.tokenize(...)` + `encode_from_tokens_scheduled` 안에서 **AR 모델이 acoustic 조건 시퀀스를 생성**한다. caption·lyrics·seed·duration이 전부 여기서 소비됨.

### 그래프 조립 (구현 시 공식 템플릿과 파라미터 최종 대조)
```
CLIPLoader(minimax_music)  ─┐
                            ├─ MiniMaxMusic3TextEncode ─ CONDITIONING ─┐
caption / lyrics / seed ────┘        └─ seconds ─┐                     │
                                                 ├─ EmptyMiniMaxMusic3LatentAudio ─ LATENT ─┤
UNETLoader(dit) ─ MODEL ─ [LoraLoaderModelOnly ×N, enabled 슬롯만] ────────────────────────┤
                                                             (flow 샘플러: euler/simple 계열) │
                                                                                    sampler ─ LATENT
VAELoader(dav) ─ VAE ──────────────────────────── VAEDecodeAudio ── AUDIO ── SaveAudio(flac/mp3)
```
- caption 없이 lyrics만 / lyrics 없이(instrumental) caption만도 유효.
- **duration**: 두 경로 — 텍스트에서 파싱("1분") 하거나 `Song` 아코디언의 duration 슬라이더 값. TextEncode `max_duration`에 전달, "모델이 더 일찍 끝낼 수 있음" 안내.

---

## 2. UI — SUNO 레이아웃 + STUDIO_ONE 아이덴티티

**레퍼런스 = SUNO AI 웹앱** (사용자 제공 스크린샷 2장). 레이아웃은 SUNO 그대로 가되,
색상·컴포넌트·버튼·상단바는 STUDIO_ONE 페밀리 자산(`web/shared/ui.ts` / `ui_common.js`,
`C.*` 토큰, `BRAND`) 재사용. 로컬 모델이 지원 안 하는 것만 제외.

### 2.-1 디자인 품질 기준 (필수)

**SUNO처럼 깔끔하게. 엑셀 리스트처럼 만들지 말 것.** 구현 시 이 기준을 지킨다:

- **플레이리스트 = 카드형 행**, 표 아님. 행 사이 여백(≥8px), 구분선 없음(hover 시에만 배경 살짝 밝아짐), 모서리 라운드. 셀·격자선 금지.
- **앨범 커버가 시각적 앵커** — 행 왼쪽에 48~56px 정사각 썸네일, 라운드, 살짝 그림자. 제목은 그 옆에 크게(14px, `C.text`), 캡션 1줄은 작고 흐리게(11px, `C.muted`, ellipsis). 길이·태그는 우측 정렬로 조용히.
- **아이콘 버튼은 기본 투명 → hover 시 배경 원형**, 항상 보이는 무거운 버튼 아님. `♻ ⓘ ⬇ ⋯`는 행 hover 시 페이드인(모바일은 상시).
- **✨ 버튼** = 브랜드색 원형 아이콘 버튼(SUNO 스크린샷의 파란 ✨처럼), 텍스트 라벨 X. 아코디언 툴바 아이콘들은 12px 회색 → hover 시 `C.text`.
- **아코디언 헤더**: 접힌 상태에서 현재 설정 요약을 흐리게 한 줄(기존 페밀리 패턴). 펼침 애니메이션 부드럽게.
- **입력 박스**: 라운드, `C.bg2` 배경, 포커스 시 브랜드색 얇은 테두리. placeholder는 안내문처럼 friendly.
- **하단 플레이어 바**: 노드 하단에 붙은 하나의 매끈한 바 — 미니 커버 + 곡명 / 중앙 컨트롤(⏮ ▶ ⏭ 큼직) / 스크럽바(브랜드색 진행) / 볼륨. 반투명 배경 + 상단 얇은 구분선. SUNO 하단 바 그대로.
- **여백**: 좁은 노드 안이지만 답답하지 않게 — 섹션 간 12~16px, 패널 안쪽 패딩 12px.
- 색·폰트·컴포넌트는 전부 `web/shared` / `ui_common.js`에서. 새 색상 정의 금지.
- **레퍼런스와 나란히 놨을 때 "SUNO를 STUDIO_ONE 색으로 옮긴 것"으로 보여야 함.** dense한 관리자 툴처럼 보이면 실패.

### 2.0 전체 레이아웃 — 2패널 + 하단 플레이어 바

**다른 페밀리 노드와의 차이**: 나머지 툴은 `좌측 패널 + 우측 프리뷰` + 갤러리를 **모달 오버레이**로 연다.
이 노드는 SUNO처럼 **왼쪽 작성 패널 + 오른쪽 플레이리스트를 나란히 상시 노출** + 하단 전체폭 플레이어 바.
**"갤러리 열기" 버튼 없음** — 플레이리스트가 그냥 항상 거기 있음. 프리뷰 박스 개념도 없음(플레이어 바가 그 역할).

```
┌─ 심플 | 고급 ────────────┬─ Playlist ───────────────────────────────┐
│                          │  🔍 Search   Filters   Newest ▾   1/N     │
│  ✨ 영감 (테마→전부 초안) │  ────────────────────────────────────────  │
│                          │  [커버] Title Song       4:05  ★ ♻ ⓘ 🗑  │
│  ▼ 가사   ↶↷ 🏷 📚 ⛶  ✨ │  [커버] Title Song       4:29  ★ ♻ ⓘ 🗑  │
│  ┌────────────────────┐  │  [커버] Still It's You.  4:05  ★ ♻ ⓘ 🗑  │
│  │ 자유 입력          │  │  [커버] ...                                │
│  │ (완성가사/브리프/훅)│  │  [ Load more ]                            │
│  └────────────────────┘  │                                          │
│                          │                                          │
│  ▼ 스타일       📚  ✨ ↻  │                                          │
│  ┌────────────────────┐  │                                          │
│  │ ### Global Meta... │  │                                          │
│  └────────────────────┘  │                                          │
│  [활기팝][합창][일본]...  │                                          │
│                          │                                          │
│  ▶ 추가 옵션             │                                          │
│                          │                                          │
│  🗑        [■][▶ 만들기]  │                                          │
├──────────────────────────┴──────────────────────────────────────────┤
│  ⇄  ⏮  ▶  ⏭  ↻      0:19 ━━━━━━━━━━━━ 4:05      🔊 ──   ⓘ  ↗  ⋯     │
└─────────────────────────────────────────────────────────────────────┘
```

- 노드 캔버스 위젯이 2컬럼이라 기존보다 **넓음** (`NODE_W` 확장). 좁은 캔버스 대비 최소폭 정의.
- 생성 중/직후 트랙은 플레이리스트 맨 위에 나타나며 진행바 표시 → 완료 시 자동 재생(옵션).
- 하단 플레이어 바 = 노드의 일부, 상시. shuffle / prev / ▶ / next / repeat + 스크럽(0:19 ━ 4:05) + 볼륨 + 현재곡 미니커버 + ⓘ/↗/⋯. 트랙 넘겨도 재생 유지, 자동 다음곡.

### 2.1 좌측 작성 패널

```
✨ 영감 — 테마 한 줄 → 가사·스타일·커버·제목 전부 초안 (옵션, 최상위)

▼ 가사              ↶ ↷  🏷  📚  ⛶      ✨
┌───────────────────────────────────────────┐
│ (자유 입력: 완성 가사 / 브리프 / 훅 조각)  │
│ placeholder: "가사를 쓰거나, 비우면 연주곡"│
└───────────────────────────────────────────┘

▼ 스타일                        📚         ✨ ↻
┌───────────────────────────────────────────┐
│ ### Global Metadata ...                   │
│ ### Vocal Details ...                     │
│ ### Arrangement ...                       │
└───────────────────────────────────────────┘
[활기 넘치는 팝] [합창] [일본 음악] [신스] ...   ← 스타일 칩

▶ 추가 옵션
   duration · steps · cfg_scale · top_k
   sampler · scheduler · seed(+모드) · batch
   ☑ 앨범 커버 생성 (Krea2)
   LLM: [로컬(TJ_NODE) | OpenRouter] · 모델 ▾

▶ LoRA
   슬롯 3개 — 각: [검색 드롭다운] [strength] [☑ on/off]

🗑                        [ ■ Stop ] [ ▶ 만들기 ]
```

- **심플 / 고급 토글**: 심플 = 가사 + 스타일만. 고급 = + 추가 옵션.
- **✨ = 각 섹션에 인라인, 그 섹션 내용에만 작동.** 별도 LLM 패널/탭 없음.
- **가사·스타일 입력 필드는 하단 엣지 드래그로 높이 조절.** MMH3 프리뷰 리사이즈 패턴 재사용
  (`ui_prompt_edit_minimax.js` / `one_node_minimax_h3.js`의 `previewResizeHandle` + `applyPreviewH` +
  localStorage clamp). 각 필드 독립: `mmm_lyrics_h` / `mmm_style_h`, min ~96px, max ~패널 높이.
  노드 전체 높이는 그대로, 한쪽을 키우면 다른 아코디언이 밀림.

### 2.2 가사 ✨ 라우팅 (내용 판별)

| 박스 상태 | 판별 신호 | 실행 |
|---|---|---|
| `[Verse]`/`[Chorus]` 태그 있음 | 섹션 태그 | **인핸스** (`lyrics_enhance`) |
| 여러 줄 가사 구조, 지시문 없음 | 줄 수 ≥ 4, "만들어", "~짜리", "이런 느낌" 등 메타 언어 없음 | **인핸스** |
| 지시문/설명 포함 | "가사", "만들어", "~분", "이야기", "느낌" 등 | **브리프 → 생성** (`lyrics_from_theme`) |
| 1~2줄 조각 | 짧고 가사스러움 | **훅 → 확장** (`lyrics_from_theme`, hook 모드) |
| 비어있음 | — | **스타일 캡션 기반 초안** (`lyrics_from_theme`, style-seeded) |
| `🏷` 버튼 (별도) | — | **제목 → 가사** (`lyrics_from_title`) — 제목 팝오버 |

분량: 텍스트에서 "N분"/"N초" 파싱 → 없으면 duration 슬라이더. 언어: 언어 셀렉터 또는 입력 텍스트 자동감지.

### 2.3 스타일 ✨

- **✨** = `caption_rewrite` (music-caption-rewriter 스킬). 입력 = 스타일 박스의 짧은 brief + 칩 + (옵션) 현재 가사. 출력 = 3섹션 구조화 캡션을 박스에 씀.
- **↻** = 같은 brief로 변형 재생성 (seed만 바꿈).
- **칩** = 클릭 시 스타일 박스 텍스트에 추가 (레퍼런스 스크린샷의 칩과 동일).

### 2.4 우측 — 플레이리스트 (상시 노출, 오버레이 아님)

**별도 갤러리 오버레이를 만들지 않는다.** 이미지 툴들과 달리 플레이리스트가 우측 컬럼에 항상 붙어있음 (SUNO).
```
Playlist                        🔍 Search   Filters   Newest ▾   ◀ 1 ▶
─────────────────────────────────────────────────────────────────────
☐ [커버] Midnight City Walk    2:14   8s·euler    ♻  ⓘ  ⬇   ⋯
☐ [커버] Warm Acoustic Morning 1:48   ...         ♻  ⓘ  ⬇   ⋯
☐ [커버] Neon Ballad (연주곡)   3:02   ...         ♻  ⓘ  ⬇   ⋯
                                                     [ Load more ]
```
- 행 클릭 = 하단 플레이어 바에서 재생 (썸네일 hover 시 ▶ 오버레이).
- 썸네일 = 앨범 커버 (§4). 없으면 스타일별 음악 아이콘 폴백.
- 우측 요약 = 모델/설정 태그 (SUNO의 v4.5-all 배지 자리) — duration·sampler 등.
- **행 인라인 액션** (SUNO의 👍좋아요 / 👎싫어요 / ↗공유 자리에 그대로):
  - **♻ Reuse** — 전 상태 복원 (`Object.assign(state, meta)`)
  - **ⓘ Info** — 전체 캡션 + 가사 + 파라미터 모달
  - **⬇ Download** — 오디오 파일 저장 (+ 커버 동봉 옵션)
- **⋯ 메뉴** (행 끝 3점): 이름 변경 / ★즐겨찾기 토글 / 커버 다시 생성 / 폴더 열기 / **삭제**
- 상단: 🔍 Search / Filters(즐겨찾기·연주곡·모델) / 정렬(Newest·길이·제목) / 페이지네이션 — `/minimax_music_one/gallery?limit&offset&sort&filter`
- **멀티 선택 삭제**: 행 좌측 체크박스(☐) — 이미지 갤러리 Select 모드와 동일. 선택 시 상단에 "N개 선택 · 삭제 / 즐겨찾기" 바 노출. `/minimax_music_one/delete` 는 파일명 배열을 받음.
- 생성 중 트랙: 맨 위에 진행바 행. 완료 시 프리뷰 락 (`previewLocked` — 늦게 오는 progress WS 무시, MMH3 패턴) → 자동 재생(옵션).

### 2.5 큰 편집 오버레이 (⛶) — H3 Prompt Edit 스타일

가사/스타일 박스가 좁아서 답답 → ⛶ 누르면 **전체폭 편집 오버레이**.
`web/minimax/ui_prompt_edit_minimax.js`의 `createPromptEditOverlay` 셸·스타일 재사용.

**공통**: 큰 textarea, 그 안에서도 ✨ LLM 액션·📚 프리셋·↶↷·글자수 전부 사용 가능. ESC/✕로 닫기, 내용은 상시 좌측 박스와 양방향 동기화.

| | 가사 오버레이 | 스타일 오버레이 |
|---|---|---|
| 레이아웃 | 좌: 편집기 / 우: 섹션 목차 (`[Verse]` `[Chorus]` … 클릭 점프, 줄/음절 수 표시) | 3개 헤딩(Global Metadata / Vocal Details / Arrangement)을 접이식 섹션으로, + 칩 패널 |
| LLM | 가사 만들기 / 제목→가사 / 인핸스 / 특정 섹션만 재생성 | 음악 프롬프트 작성 / 변형(↻) / Music Brief·선택 패밀리 보기(토글) / 특정 헤딩만 재생성 |
| 부가 | 태그 삽입 버튼 (`[Verse]` `[Pre-Chorus]` …), 연주곡 토글 | 칩 클릭 추가, 언어 선택 |

⛶는 가사·스타일 아코디언 툴바 양쪽 모두에 있음 (스타일 툴바에도 추가).

### 2.6 설정 오버레이 — 모델 (이미지 툴과 동일 패턴)

`web/minimax/ui_app_settings_minimax.js` 스타일 설정 오버레이. **Models 탭**:

| 슬롯 | 폴더 | 저장 |
|---|---|---|
| DiT (UNET) | `models/diffusion_models/` (`minimax_music3_dit_*`) | `config` |
| Audio VAE (DAV) | `models/vae/` (`minimax_music3_dav*`) | `config` |
| Text encoder | `models/text_encoders/` (`minimax_music3_text_encoder_*`) | `config` |

- `searchableSelect` (검색 가능 드롭다운) — 이미지 툴 그대로.
- `/minimax_music_one/config` GET/POST 로 서버 저장 → 한 번 설정하면 계속 기억 (이미지 모델처럼). `tj_state` 폴백도 동일.
- 좌측 패널엔 현재값만 표시 (편집은 설정에서).
- 그 외 탭: Sampling 기본값 · Output(subfolder/포맷) · LLM 기본값.

### 2.7 LoRA — 이미지 툴 방식 그대로 복사

- 좌측 패널 `▶ LoRA` 아코디언, **슬롯 3개**.
- 각 슬롯: `loraSelect` (검색 기능 있는 드롭다운, `ui_common.js` 그대로) + strength 숫자 + `☑ on/off` 토글.
- state: `state.loras = [{name, strength, enabled}, ...]` — MMH3 graph_builder의 유저 LoRA 체인 패턴 동일.
- 그래프: DiT MODEL 뒤에 `LoraLoaderModelOnly` 체인 (enabled && name!=="none" && strength>0 인 것만), 샘플러 직전.
- 트리거워드 표시(있으면) — 이미지 툴의 `getLoraTriggers` 재사용.
- 메타에 `loras` 저장, Reuse 복원.

### 2.8 프리셋 관리 — 항목별 📚

`web/minimax/ui_presets_minimax.js`의 `createPresetDialogs` (저장 다이얼로그 + 관리 다이얼로그: 목록·드래그정렬·삭제) 그대로 재사용. **두 벌**:

| 📚 | 저장 단위 | 저장소 | 라우트 |
|---|---|---|---|
| 가사 아코디언 📚 | 이름 붙인 가사 or 가사 브리프 템플릿 | `music_lyrics_sets/` | `/minimax_music_one/lyrics_presets/{list,get,save,delete}` |
| 스타일 아코디언 📚 | 이름 붙인 스타일 (brief + 칩 + 3섹션 캡션 전부) | `music_style_sets/` | `/minimax_music_one/style_presets/{list,get,save,delete}` |

각 📚 메뉴 = 현재 저장 / 불러오기 / 이름변경 / 삭제 / 드래그 정렬. `prompt_sets/` 라우트 팩토리 재사용.
> 실제 구현(2026-09-06): 프리셋 팝업의 각 행 = `[이름(클릭=불러오기)] [↺ 이름변경] [✕ 삭제]`.
> 이름을 타이핑해서 지우는 방식 아님. 이름변경은 백엔드 라우트 없이 클라이언트에서
> `get → save(새이름) → delete(옛이름)`. `{save,delete,get}` 라우트만 있으면 됨.
파이프라인 프리셋(steps/cfg/모델 레시피)은 별개 — 추가 옵션 안 (H3의 System/User Preset처럼).

---

## 3. LLM 파이프라인 (이 노드의 본체)

### 3.1 시스템 프롬프트 템플릿 6개 (노드에 번들, `web/minimax_music/llm_prompts/`)

| id | 입력 | 출력 |
|---|---|---|
| `lyrics_from_theme` | 브리프/훅/무드 + 언어 + 분량 (+ 옵션 스타일 캡션) | `[Verse]`/`[Pre-Chorus]`/`[Chorus]`/`[Bridge]`/`[Instrumental]`/`[Outro]` 태그 붙은 완성 가사, 지정 언어, 분량에 맞는 섹션 수 |
| `lyrics_from_title` | 곡 제목 + 언어 (+ 옵션 분량) | 그 제목 정서에 맞는 태그 가사 |

> **분량 강제(2026-09-06)**: `duration_seconds`는 이제 `effectiveDuration(state)`로 계산 —
> 가사/스타일 브리프에 적힌 "3:00"/"3분" 힌트가 슬라이더보다 우선. 두 lyric LLM
> 호출 지점(✨ compose, `processJob` 큐) 모두 이 값을 넘김. `lyrics_from_theme.md`
> / `lyrics_from_title.md`에 **필수 구조 표** 추가: 부른 가사는 곡 길이의 ~55–70%,
> 한 줄 ~3–4초 → 3분 곡 ≈ 30–42줄 (1절 + 짧은 코러스로 끝내지 말 것). 짧은 훅은
> 전체 곡으로 확장. `comfyTextGen.max_length` 1400→2048. 웹도 동일 적용 필요.
| `lyrics_enhance` | 현재 가사 전체 | 이미지·운율 다듬고 섹션 보강, **태그·구조·언어 유지**, 길이 크게 안 바꿈 |
| `caption_rewrite` | 짧은 스타일 brief + 칩 + (옵션) 가사 | music-caption-rewriter 3섹션 (Global Metadata / Vocal Details / Arrangement), 영어, 250~450단어 |
| `title` | 가사 or 스타일 캡션 | 트랙 제목 한 줄 (사용자 편집 가능) |
| `cover_prompt` | 스타일 캡션 | Krea2 t2i용 비주얼 프롬프트 (정사각, 텍스트 없음, 추상/무드 중심) |

### 3.2 caption_rewrite는 멀티스텝

music-caption-rewriter 스킬 자체가 progressive disclosure. 로컬 LLM으로:
1. **호출 1** — Music Brief 추출 + 장르 라우팅. 참조: `genre-router.md` (번들).
2. **호출 2** — 선택된 패밀리 인덱스(들) 주고 → 레퍼런스 3개(Foundation/Modifier/Arrangement) 선택 + 섹션별 타임라인 설계.
3. **호출 3** — 3섹션 캡션 렌더 + Output Contract 검증. 실패 시 1회 재시도.
- 중간 산출물(Music Brief, 선택 패밀리) 옵션 표시 (기본 숨김).
- 단일 모델 컨텍스트가 크면 1~2 호출로 합쳐도 됨 — 모델 성능에 따라.

### 3.3 번들 범위 (결정: genre-router + 18개 패밀리 인덱스 + 패밀리당 대표 템플릿 2~3개)

- `github.com/MiniMax-AI/MiniMax-Music3/skills/music-caption-rewriter/` 에서:
  - `SKILL.md` (지침, `caption_rewrite` 시스템 프롬프트 베이스)
  - `references/genre-router.md`
  - `references/index-*.md` (18개 패밀리 인덱스) — **전부**
  - `templates/` 에서 패밀리당 대표 2~3개 (~50개) — LLM이 구체 예시 보고 합성하도록
- 1000개 템플릿 전체는 **옵션 다운로드** (retrieval용, 기본 제외 — 리포 무게)
- 라이선스 확인 후 vendored (MiniMax-AI 레포 라이선스 명시할 것)

### 3.1a 시스템 프롬프트는 엔진별로 분리 (필수)

두 모델의 프롬프트 작성 방식이 완전히 다름:
- **`caption_minimax.md`** — `### Global Metadata / ### Vocal Details / ### Arrangement` 3섹션, 250~450단어, music-caption-rewriter 스킬 기반
- **`caption_acestep.md`** — 밀도 높은 서술형 문단 1개, 60~120단어, "장르 + in the style of 아티스트 + 무드 변화 + 시그니처 악기 + 프로덕션 워딩 + 그루브 + 보컬". BPM/key/timesig는 별도 필드라 캡션엔 안 넣음
- 가사 프롬프트 3개(`lyrics_from_theme` / `_from_title` / `_enhance`)는 엔진 공용 — 둘 다 `[verse][chorus][bridge]` 태그 사용
- ✨ 버튼이 `state.engine` 보고 `CAPTION_ROLE()` → 자동 선택

### 3.4 모델 (결정: 로컬/OpenRouter 스위치 — 구현됨)

- **로컬** = `ComfyUI-TJ_NODE` gguf 러너 (H3 브리프와 동일).
- **OpenRouter** = `music_llm_run`이 `backend=="openrouter"`면 `https://openrouter.ai/api/v1/chat/completions` 직접 호출. API 키: `LLM_KEY` 환경변수 → `custom_nodes/ComfyUI-Openrouter_node/openrouter_api_key.json`. 기본 모델 `google/gemini-2.5-flash`. `/music_one/openrouter_models` 로 모델 목록 프록시.
- **`ComfyUI-Openrouter_node`는 의존성 설치에 추가됨** — `install_requirements.bat` REPOS[24], `.sh`, `dependency_check.py`. (caption/lyrics는 지시 이행력이 중요해 로컬 3B로 부족할 수 있음.)

- `web/shared/llm_panel.js` 인프라 재사용. **로컬**은 `ComfyUI-TJ_NODE` gguf 러너 (H3 브리프와 동일).
- **OpenRouter** 옵션 추가 — `ComfyUI-Openrouter_node` (이미 설치됨). caption_rewrite는 지시 이행력이 중요해 3B 로컬로 부족할 수 있음.
- 추가 옵션에 `LLM: [로컬 | OpenRouter]` 스위치 + 모델 드롭다운. 6개 역할 전부 같은 모델, 시스템 프롬프트만 다름.
- 역할별 온도: 가사/커버 = 창의(높음), caption_rewrite/title = 정확(낮음).

---

## 4. 앨범 커버 — Krea2 크로스 통합 (첫 페밀리-툴 연동)

- 추가 옵션 `☑ 앨범 커버 생성 (Krea2)` (기본 on).
- 음악 생성과 **병렬**: `cover_prompt` LLM → `web/krea2/graph_builder_krea2.js` 재사용해서 t2i 그래프 (512², ~8 스텝, `config_krea2.json` 모델 그대로) → 별도 prompt로 제출.
- 커버 → `output/one_music/covers/`. 트랙 메타에 `coverImage`. 실제 구현은 곡 저장
  직후 순차 실행이되 `makeCover(...).catch(()=>{})` — 커버 실패가 오디오를 막지 않음.
- 플레이리스트 썸네일 + 플레이어 바 미니 커버.
- **커버 다시 만들기**: 플레이리스트 행 `⋯` 메뉴 → "Regenerate cover". 프롬프트 입력
  없음. `regenCover(t)` 가 트랙 메타를 읽어 새 랜덤 시드로 `coverImage(meta)` 재실행 후
  `update_meta` 로 `coverImage` 패치. LLM 빈 응답이면 `caption/title` 폴백.
- **생성 순서 (커버 먼저)**: `generate()` 는 (1) `pendingGen` 카드를 리스트 최상단에 즉시
  올리고 (2) `coverImage(meta)` 로 커버를 **먼저** 만들어 카드에 얼굴을 주고 (3) 음악 그래프
  제출. 커버 파일명은 그대로 `meta.coverImage` 에 실려 저장됨.

## 4.1 실시간 생성 카드

- `generate()` 시작 → `pendingGen = { title, engine, stage, pct, cover, err }`, `renderPlaylist()`.
- WS `progress` / `executing` 이벤트를 `prompt_id` 로 필터해 `pendingGen.stage` / `pct` 갱신,
  `paintPending()` 이 DOM 을 제자리 갱신(리렌더 없음). 단계 라벨:
  `Making cover… → Queued… → Encoding prompt → Sampling → Decoding audio → Saving → Finishing…`.
- 완료 → `pendingGen=null` + `loadPlaylist()` 로 실제 트랙 카드로 교체. `loadPlaylist` 는
  재생 중이던 곡을 파일명으로 `curIdx` 재매핑. 사용자가 딴 곡 듣는 중이면 자동재생 안 함.
- 실패 → 카드가 빨개지고 `✕` 로 닫기. 생성 중에도 다른 트랙 재생 가능.
- `/prompt` 응답의 `node_errors` 가 성공 시에도 `{}` 로 오므로 `Object.keys(...).length` 로 판정.

## 4.2 다운로드 = 태그 박힌 MP3

- 행 `↓` → `GET /music_one/download?filename=&subfolder=` → `_ffmpeg_exe()` 로 MP3 변환하며
  ID3v2 임베드: 커버(`-disposition:v attached_pic`, mjpeg), `title`, `artist=AI ONE STUDIO`,
  `album=MusicMaker`, `comment=<스타일 캡션>`, `encoded_by=<엔진>`, `lyrics=<전체 가사>`, `MMM_SEED`.
- `output/one_music/.export/<title>.mp3` 캐시, 오디오/메타/커버가 더 최신이면 재생성.
- 프론트는 blob 으로 받아 `<a download>` `.mp3`.

---

- **Krea2 미설치 시**: 토글 자동 비활성 + "Krea2 필요" 안내.

---

## 5. 노드 / 패키지 플러밍

### 5.1 `nodes.py`
- 새 노드 클래스 `MiniMaxMusicOneTJNode` — display "MiniMax Music ONE STUDIO (TJ)". 단일 캔버스 노드, DOM 위젯. 포트: `pipe`(TJ_PROMPT_PIPE) 옵션 in, `AUDIO` 옵션 out.
- `MMM_SUBFOLDER = "one_minimax_music"`
- 라우트 (klein/krea2가 쓰는 `_make_*_handler` 팩토리 재사용):
  - `/minimax_music_one/gallery` — 플레이리스트 목록 (오디오 파일 + `has_meta`)
  - `/minimax_music_one/meta` (GET) · `/save_meta` · `/update_meta` (POST)
  - `/minimax_music_one/config` (GET/POST) — 모델·기본값
  - `/minimax_music_one/models` — diffusion_models / vae / text_encoders 목록 (`folder_paths`)
  - `/minimax_music_one/audio` (GET) — 트랙 스트리밍 (Range 지원)
  - `/minimax_music_one/open_folder` · `/delete`
  - `/minimax_music_one/lyrics_presets/*` · `/style_presets/*`
  - `/minimax_music_one/lora_triggers` — 트리거워드 (이미지 툴 재사용)
  - `/minimax_music_one/llm/*` — 6개 역할 (H3 llm 라우트 패턴)
- `MMH3_OPTIONAL_NODES` 스타일 가용성 체크 — `MiniMaxMusic3TextEncode`, `EmptyMiniMaxMusic3LatentAudio`, `VAEDecodeAudio`, `SaveAudio` (전부 코어라 항상 있음), `ComfyUI-TJ_NODE`(LLM), Krea2 노드(커버 옵션).
- **가용성 리스트는 `nodes.py` AND `web/minimax_music/api_*.js` 둘 다** ([[project_mmh3_dual_availability_list]]).

### 5.2 웹 (노드)
- `web/minimax_music/` — `graph_builder_music.js`, `core_music.js`, `api_music.js`, `ui_playlist_music.js`, `ui_lyrics_music.js`, `ui_style_music.js`, `ui_app_settings_music.js`, `presets_music.js`, `llm_prompts/*.md`
- `web/one_node_minimax_music.js` — 노드 등록 + 셸
- `web/shared/llm_panel.js` — 음악 역할 6개 추가 (또는 음악용 별도 얇은 래퍼)

### 5.3 메타 필드 (사이드카 `output/one_minimax_music/metadata/*.json`)
`caption, captionBrief, styleChips, lyrics, lyricsInput, instrumental, seconds(요청), actualSeconds, seed, seedMode, steps, cfg_scale, top_k, sampler, scheduler, batch, dit, dav, clip, loras[], format, llmBackend, llmModel, styleFamily, title, coverImage, musicBrief(옵션), refFamilies(옵션)`

### 5.4 설치 스크립트
- 모델 팩 없음 (네이티브). `install_requirements.*` 변경 없음.
- caption-rewriter 스킬 vendored → repo에 커밋 (라이선스 확인 후).
- 랜딩 메뉴(웹): 새 카테고리 **🎵 Music Generator** > "MiniMax Music" 카드.

---

## 6. 웹 미러 (`AI_One_Studio`)
- `src/tools/minimax_music/` — core.ts / graphBuilder.ts / api.ts / view.ts / playlist / presets / llmPrompts
- 랜딩 메뉴 카테고리 추가
- 웹은 백엔드 없음 — 모든 `/minimax_music_one/*` 라우트는 노드의 것, 웹은 thin client
- PORT_LEDGER에 행 추가

---

## 7. 열린 항목 (구현 중 확정)
- flow 샘플러 정확한 노드 + 파라미터 → 공식 MiniMax Music 템플릿 로드해서 대조
- `MAX_AUDIO_FRAMES / AUDIO_FRAMES_PER_SECOND` 실제 상한값 (duration 슬라이더 max)
- caption_rewrite 1-call vs 3-call — 실제 로컬 모델로 품질 테스트 후
- 앨범 커버 해상도/스텝 — Krea2 turbo 모델 있으면 더 빠르게
- music-caption-rewriter 라이선스 → vendored 가능 여부

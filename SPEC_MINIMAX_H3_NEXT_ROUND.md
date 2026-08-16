# SPEC — MiniMax H3 ONE STUDIO 다음 라운드 (통합)

한도 리셋 후 이 문서 하나로 바로 시작한다. 세 축이다:

- **PART A — 프롬프트 워크벤치**: 온/오프, 이어서 돌리기, 세트 저장, 갤러리 스티치
- **PART B — One-Take 모드**: latent 레벨 연속 생성 (신규 Continuity 옵션)
- **PART C — Image → Brief 멀티 이미지 + 2단계 LLM 파이프라인**

**작업 순서 — 전체**

| # | 항목 | Part | 선행 |
|---|---|---|---|
| 1 | 프롬프트 객체 전환 | A | — (A2·A3·A5·B4의 토대) |
| 2 | 프롬프트 온/오프 + 실제 인덱스 | A | 1 |
| 3 | First image 오버라이드 | A | 1 |
| 4 | 초기화 버튼 | A | — |
| 5 | 프롬프트 세트 저장/불러오기/삭제 | A | 1 |
| 6 | 갤러리 스티치 | A | — |
| 7 | latent 체크포인트 저장/로드 노드 | B | — |
| 8 | One-Take 커스텀 노드 (mask 구성) | B | 7 |
| 9 | Continuity에 One-Take 옵션 추가 | B | 8, (A1 있으면 더 쉬움) |
| 10 | One-Take 검증 (latent 대조 → 실기기) | B | 9 |
| 11 | 비전 모델 / 브리프 모델 분리 설정 | C | — |
| 12 | 이미지 다중 업로드(1~8장) + FL/Ref 모드별 상한 | C | — |
| 13 | 순차 비전 분석 → 브리프 모델 합성 파이프라인 | C | 11, 12 |

1번을 건너뛰고 2·3을 하면 병렬 배열이 되어 프롬프트 추가·삭제·분리 때 인덱스가 어긋난다.
B는 A1이 없어도 독립적으로 가능하지만, A1이 있으면 §B4(중단 후 재개)가 A의 온/오프 UI를
그대로 재사용할 수 있어 더 싸게 먹힌다. **A를 먼저 끝내고 B로 가는 순서를 권장.**

> ⚠️ **시작 전 확인 필요한 것 둘**
> 1. A6(갤러리 스티치)은 "실행 중 자동 스티치를 갤러리로 이동"이다. 실행이 끝나도 합본이
>    자동으로 안 나온다. 이대로 갈지 실행 중 스티치를 남길지 한 번만 확정한다.
> 2. B는 릴레이 구조와 안 맞는 부분이 있어 체크포인트 저장/로드(B-§4 B안)가 선행돼야 한다 —
>    아래 B 섹션 참고.

---

**구현 완료 (문법 체크만, 실기기 미검증)** — A1~A6 전부 코드로 반영됨:
`core_minimax.js`(prompts 객체화·`promptText`/`promptFirstFrame`/`promptEnabled`/`activePrompts`
접근자·`clipPlan`이 on-개수 기준으로 변경), `one_node_minimax_h3.js`(메인 스트립 체크박스·
실제 인덱스 기반 릴레이 루프·좌측 패널에서 스티치 옵션 제거), `ui_prompt_edit_minimax.js`
(체크박스·per-prompt first-frame 오버라이드·↺ 초기화(뷰포트 중앙 팝업)·세트 저장/불러오기/삭제
툴바), `ui_gallery_minimax.js`(🔗 스티치 모드, 최대 10개, 순서 배지, ≈총길이, 해상도 경고),
`nodes.py`(`/minimax_h3_one/prompt_sets*` 4개 라우트, 이름 검증). §A7 테스트 체크리스트는
아직 실기기로 돌지 않았음 — 다음 세션에서 ComfyUI 재시작 후 확인 필요.

# PART A — 프롬프트 워크벤치

**핵심 사용 시나리오** — 클립 20개짜리를 만들다 10번에서 중단했다. 11번부터 이어서 돌리고 싶다.
1~10번을 끄고 11번에 앞 클립의 마지막 프레임을 넣은 뒤 실행하면 된다.

## A1. 프롬프트 객체 전환

### 상태 구조

```js
// before
state.prompts = ["shot one", "shot two"]

// after
state.prompts = [
  { text: "shot one", firstFrame: "", enabled: true },
  { text: "shot two", firstFrame: "", enabled: true },
]
```

### 마이그레이션

`defaultState()` 에서 흡수한다. 문자열이면 감싸고, 객체면 빠진 필드를 채운다.

```js
prompts: (Array.isArray(saved.prompts) && saved.prompts.length ? saved.prompts : [""])
  .map(p => (typeof p === "string"
    ? { text: p, firstFrame: "", enabled: true }
    : { text: p?.text || "", firstFrame: p?.firstFrame || "", enabled: p?.enabled !== false })),
```

v1.10.0 이전 워크플로우와 localStorage가 전부 문자열 배열이므로 **이 한 곳에서 반드시 처리**한다.

### 손봐야 하는 곳

`state.prompts[i]` 를 문자열로 다루는 모든 지점:

| 파일 | 지점 |
|---|---|
| `core_minimax.js` | `clipPlan`(개수) · `composeClipPrompt`(본문 조회) |
| `one_node_minimax_h3.js` | `renderPrompts` · `promptForClip` · `addBtn` · 삭제 · `splitBtn` · `metaForVideo`(사이드카의 `prompts`) · `ctx.reusePrompt` |
| `ui_prompt_edit_minimax.js` | 리스트 렌더 · 에디터 로드/저장 · 추가/삭제 · `snapshot`(undo) · `applyReview` · split 적용 |

산재를 막기 위해 core에 접근자를 하나 둔다:

```js
export const promptText = (p) => (typeof p === "string" ? p : (p?.text || ""));
```

> 사이드카(`metaForVideo`)의 `prompts` 필드는 **문자열 배열을 유지**한다. 갤러리 Reuse가 읽는
> 형식이고 외부에 나가는 데이터다. 저장할 때 `.map(promptText)` 한다.

## A2. 프롬프트 온/오프 + 실제 인덱스

### UI

- **메인 노드 프롬프트 스트립**: `C1` 배지 옆에 체크박스. 끈 프롬프트는 흐리게(`opacity: .5`).
- **Prompt Edit 리스트**: 같은 체크박스.
- 헤더에 현재 상태 표시 — `(20 prompts · 10 on → 10 clips · 80.0s)`

### 실행

```js
const active = state.prompts
  .map((p, i) => ({ p, i }))          // i = 원래 번호. 절대 다시 매기지 않는다
  .filter(({ p }) => p.enabled !== false);
```

`active` 를 순서대로 렌더하되 **`i` 를 그대로 넘긴다.** 이것만 지키면 아래가 전부 따라온다:

| 따라오는 것 | 이유 |
|---|---|
| 오디오 락 구간 | `startSec = clipIndex * clipSeconds` — 11번이면 11번 구간 |
| 시드 | `seedForClip(i)` = `seed + i` |
| 파일명 | `MMH3_clip011_*` — 중단 전 파일들과 번호가 이어진다 |

### 엣지 케이스

- 전부 꺼져 있으면 실행 전에 막는다 — `"No prompts are switched on."`
- 켜진 게 하나면 지금의 단일 클립 실행과 동일하게 동작한다.
- ETA·총 길이는 **켜진 개수 기준**으로 계산한다.

## A3. First image 오버라이드

### 규칙

```
오버라이드가 있으면 → 그 이미지를 first frame 으로 사용
비어 있으면        → 지금 모드의 기본 동작 그대로 (변경 없음)
```

기본 동작은 건드리지 않는다. Last Frame Chain이면 직전 클립의 마지막 프레임, Reference면
레퍼런스 유지, None이면 없음 — 현재 로직 그대로다.

### UI

Prompt Edit의 각 프롬프트 행에 작은 썸네일 + `⬆ 업로드` + `✕`. 업로드는 기존 `uploadMedia`
경로를 그대로 쓴다.

**안내 한 줄이 필요하다** — first frame을 받는 모델은 FL2VA뿐이다. Reference 실행에서 특정
클립에 이미지를 지정하면 그 클립은 FL2VA로 렌더되고 레퍼런스 조건이 빠진다. Last Frame Chain과
같은 규칙이라 일관되지만, 모르면 결과를 보고 당황한다.

### 이어서 돌릴 때 쓰는 파일

수동으로 프레임을 추출할 필요가 없다. 노드가 클립마다 마지막 프레임을 이미 저장한다:

```
output/one_minimax_h3/frames/MMH3_clip010_last_00007_.png
```

11번 오버라이드에 이 파일을 올리면 된다. 안내 문구에 이 경로를 적어 둔다.

## A4. 초기화 버튼

Prompt Edit 상단에 `↺ 초기화`.

**확인 팝업은 화면 정중앙에 띄운다.** 이 노드의 다른 오버레이는 전부 노드 기준(`position:
absolute; inset: 0`)인데, 이건 `position: fixed` 로 뷰포트 중앙에 놓는다. 노드가 화면 밖으로
스크롤돼 있어도 보여야 한다.

```
프롬프트 설정을 초기화하시겠습니까?
프롬프트 1개만 남고 공통 머리말·꼬리말이 지워집니다.
                                   [취소]  [초기화]
```

지우는 것:

- `state.prompts` → `[{ text: "", firstFrame: "", enabled: true }]`
- `state.promptHeader` → `""`
- `state.promptFooter` → `""`

건드리지 않는 것: `targetLength`, 모델·가속·해상도 등 나머지 설정 전부.

실행 전에 `snapshot("reset")` 을 남겨 기존 undo(20단계)로 되돌릴 수 있게 한다.

## A5. 프롬프트 세트 저장 / 불러오기 / 삭제

34개, 12개씩 만든 프롬프트 묶음을 이름 붙여 보관하고 나중에 다시 불러온다.

### 저장 위치 — 백엔드 파일

localStorage가 아니라 **서버 파일**로 둔다. 브라우저를 바꾸거나 캐시를 지워도 남아야 하고,
`config_minimax_h3.json` 과 같은 방식이다.

```
ComfyUI-TJ_NODE_STUDIO_ONE/prompt_sets/<name>.json
```

### 저장 형식

```json
{
  "v": 1,
  "name": "뮤비 A 20클립",
  "saved": 1786700000000,
  "clipFrames": 192,
  "promptHeader": "...",
  "promptFooter": "...",
  "prompts": [
    { "text": "...", "firstFrame": "", "enabled": true }
  ]
}
```

`clipFrames` 는 참고용으로만 저장한다 — 불러올 때 현재 설정과 다르면 한 줄 알려주되
덮어쓰지는 않는다(`이 세트는 8.00s 클립 기준으로 저장됨`).

### 라우트

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/minimax_h3_one/prompt_sets` | 목록 (이름·클립 수·저장 시각) |
| GET | `/minimax_h3_one/prompt_sets/get?name=` | 하나 읽기 |
| POST | `/minimax_h3_one/prompt_sets/save` | 저장 (같은 이름이면 덮어쓰기) |
| POST | `/minimax_h3_one/prompt_sets/delete` | 삭제 |

**이름 검증 필수.** 파일명이 되므로 경로 이탈을 막는다 — 기존 `_safe_resolve_output_path` 와
같은 방식으로 정규화하고, `/ \ .. :` 등을 거른다. 빈 이름 거부.

### UI

Prompt Edit 상단에 한 줄:

```
[ 세트 ▾ ]  [📂 불러오기]  [💾 저장]  [🗑 삭제]
```

- **저장** — 이름 입력 프롬프트. 같은 이름이 있으면 덮어쓰기 확인.
- **불러오기** — 현재 프롬프트를 전부 대체한다. 되돌릴 수 있게 `snapshot("load set: 이름")`.
- **삭제** — 확인 후 삭제. A4와 같은 중앙 정렬 팝업을 재사용한다.

### 워크플로우 저장과의 관계

v1.10.0부터 노드 설정은 워크플로우에 함께 저장된다. 세트는 그것과 별개로 **워크플로우를
넘나들며 재사용**하기 위한 것이다. 둘 다 있어도 충돌하지 않는다.

## A6. 갤러리 스티치

실행 중 자동 스티치를 갤러리로 옮긴다.

- 갤러리에 `🔗 스티치` 모드. 카드를 클릭한 **순서대로 1·2·3 배지**를 붙인다.
- **최대 10개.** 10개가 차면 나머지 카드의 선택을 막고 이유를 보여준다 —
  `10 / 10 · 더 긴 편집은 영상 편집기를 쓰세요`
- 선택분의 **총 길이**를 표시한다.
- 해상도가 섞이면 경고 한 줄. 백엔드 `/stitch` 는 `-c copy` 로 붙이고 실패 시 재인코딩하므로
  크기가 다르면 느려지거나 깨진다.
- 백엔드 `/minimax_h3_one/stitch` 는 이미 파일 목록을 받는 형태라 **그대로 재사용**한다.

제거: 왼쪽 패널의 `Stitch clips into one file` · `Trim the tail to the planned length`,
그리고 릴레이 루프의 스티치 호출.

## A7. 테스트 체크리스트

**1. 객체 전환**
- [ ] 문자열 배열이 저장된 예전 localStorage로 열어도 정상 동작
- [ ] v1.10.0 이전 워크플로우를 열어도 프롬프트가 살아남음
- [ ] 추가·삭제·Split·LLM 적용·갤러리 Reuse 후에도 구조가 유지됨

**2. 온/오프**
- [ ] 1~10 끄고 11~20 켜서 실행 → 파일이 `clip011` 부터 생성
- [ ] Audio Lock ON일 때 11번 클립의 오디오가 트랙의 11번째 구간인지 (스펙트로그램 상관)
- [ ] 시드가 원래 번호 기준인지 (같은 번호 재생성 시 동일 결과)
- [ ] 전부 끄면 실행 전에 막힘

**3. First image**
- [ ] 오버라이드 지정 시 그 이미지에서 시작
- [ ] 비우면 기존 모드 동작과 동일 (회귀 없음)
- [ ] Reference 모드에서 지정 시 그 클립만 FL2VA로 가는 것이 UI에 표시됨

**4. 초기화**
- [ ] 팝업이 화면 정중앙 (노드를 화면 구석으로 옮겨 놓고 확인)
- [ ] 프롬프트 1개만 남고 머리말·꼬리말이 지워짐
- [ ] 다른 설정은 그대로
- [ ] undo로 복구됨

**5. 프롬프트 세트**
- [ ] 20개짜리 저장 → 초기화 → 불러오기 → 20개 복원
- [ ] 같은 이름 저장 시 덮어쓰기 확인
- [ ] 삭제 후 목록에서 사라짐
- [ ] `../` 같은 이름이 거부됨
- [ ] ComfyUI 재시작 후에도 남아 있음

**6. 갤러리 스티치**
- [ ] 3개를 순서대로 골라 합치면 그 순서로 나옴
- [ ] 11개째 선택이 막히고 안내가 뜸
- [ ] 총 길이가 실제 결과와 일치
- [ ] 해상도가 다른 클립을 섞으면 경고

## A8. 하지 않는 것

- **스티치 시 원본 오디오 덮어쓰기** — 클립 오디오가 이미 원본 조각이라 결과가 같다.
- **재생성본 표시(갤러리에 "클립 14 · 재생성본")** — 클립 수가 적으면 파일명으로 충분하다.
- **런 매니페스트** — 스티치가 갤러리로 가면 필요 없다.

---

**구현 및 실기기 검증 완료 (2026-08-17)** — 상세 알고리즘·소스 근거·검증 결과는
`SPEC_MINIMAX_H3_ONE_TAKE_NODE.md` 참고. 요약: `ComfyUI-TJ_NODE`에 `TJ_H3_LatentContinuation` /
`TJ_H3_SaveLatentCheckpoint` / `TJ_H3_LoadLatentCheckpoint` 3개 노드 신설(§B4 B안 그대로 —
릴레이의 클립별 큐 제출 구조를 유지한 채 latent를 디스크 체크포인트로 이어붙임), `core_minimax.js`
의 Continuity에 "One-Take (latent)" 추가, `graph_builder_minimax.js`가 continuityMode==="onetake"
일 때 이 세 노드를 자동으로 그래프에 끼워 넣음, 좌측 패널에 Overlap frames · Lock 전체 오디오
컨트롤 추가. 2클립 실기기 테스트에서 겹침 구간 latent가 float32 오차 수준(≤4.77e-7)으로 보존됨을
직접 대조 확인했다.

# PART B — One-Take 모드 (latent-level continuation)

기존 릴레이 방식(프롬프트=클립, Last Frame Chain)은 **그대로 둔다.** 이건 대량 생성·클립 간
연결성이 필요 없는 경우에 계속 쓰인다. 이 파트는 **새 메뉴/모드**로 추가하는 것에 대한 것이다
— "One-Take" 라고 부른다. 카메라 컷 없이 이어지는 한 호흡의 영상을 만드는 용도.

**출처**: [comfyui-h3-motion-context-multiref](https://github.com/designloves2/comfyui-h3-motion-context-multiref)
(GPL-3.0)의 기술 문서를 읽고 원리를 파악했다. **코드는 보지 않았고 가져오지 않는다.**
아래 메커니즘은 ComfyUI 코어 공식 소스에서 직접 확인한 것이다:

- `comfy/samplers.py:1276-1314` — `CFGGuider.sample()` 이 `denoise_mask.is_nested` 를 이미
  네이티브로 처리한다. `NestedTensor((video_mask, audio_mask))` 를 그대로 받아 각 스트림에
  맞는 shape로 `prepare_mask` 한다.
- `comfy_extras/nodes_custom_sampler.py:1047-1049` — `SamplerCustomAdvanced` 는
  `latent["noise_mask"]` 가 있으면 그대로 `denoise_mask` 로 넘긴다. **지금 우리 그래프가 이미
  쓰는 노드**라 손댈 필요가 없다.
- `comfy/nested_tensor.py` — `NestedTensor.unbind()` 로 video/audio 스트림 분리, 슬라이싱·산술
  연산 지원. latent 자르고 이어붙이는 데 필요한 도구가 이미 있다.
- `comfy_extras/nodes_minimax_h3.py` — `align_frame_count`, `temporal_shape`,
  `_empty_av_latent` 로 프레임 그리드(`17k+5`)와 오디오 latent 길이(`round(frames/24*40)`)
  계산 방식을 이미 확인함(Audio Lock 작업 때).

즉 **서드파티 노드 의존 없이, 새 커스텀 노드 하나로 구현 가능하다.**

## B1. 무엇이 다른가

| | 지금 (Last Frame Chain) | One-Take (신규) |
|---|---|---|
| 이어지는 것 | 마지막 프레임 **이미지 1장** | latent **구간 전체** (모션 포함) |
| VAE 왕복 | 있음 (디코드→FL2VA 재인코드) | 없음 (latent 그대로 복사) |
| 모델 | 이어지는 클립은 강제로 FL2VA | **원래 모드 유지** (Reference도 유지 가능) |
| 오디오 락과 결합 | 별도 메커니즘(추가 노드) | **같은 mask 연산 안에서 동시 처리** |
| 용도 | 다수 클립, 컷이 있어도 무방, 대량 생성 | 카메라가 안 끊기는 한 호흡 영상 |

## B2. 핵심 메커니즘

```
클립 N latent = { video: [B,24,T,H/16,W/16], audio: [B,32,2,T_a] }

클립 N+1을 만들 때:
  1. 빈 target latent 생성 (기존 _empty_av_latent)
  2. 클립 N latent의 마지막 K 프레임 구간을 target latent 앞부분에 복사
     (video, audio 둘 다 — NestedTensor 이므로 각 스트림 개별 처리)
  3. video mask = [0,0,...,0(복사된 구간), 1,1,...,1(생성할 구간)]
     audio mask = 같은 방식 (Audio Lock을 쓰면 오디오는 전체 0)
  4. target latent["noise_mask"] = NestedTensor((video_mask, audio_mask))
  5. SamplerCustomAdvanced 에 그대로 전달 — 추가 설정 불필요, 코어가 처리
```

**K (겹치는 구간)**: 저장소는 39프레임(1.625초, 오디오 그리드 정확히 65스텝)을 기본값으로 쓴다.
우리도 같은 값을 기본으로 시작한다 — `align_frame_count` 로 이미 검증된 그리드 경계값이라
계산이 딱 떨어진다.

## B3. 새 노드

```
class_type: MiniMaxH3LatentContinuation   (가칭, 내부 전용 — 프론트 그래프 빌더에서만 생성)
inputs:
  prev_latent   LATENT   # 직전 클립의 샘플러 출력 (디코드 안 함)
  target_latent LATENT   # 이번 클립의 빈 AV latent (_empty_av_latent 동일 규격)
  overlap_frames INT     # 기본 39
  lock_audio    BOOLEAN  # true면 오디오 전체 mask=0 (Audio Lock과 동일 발상)
outputs:
  latent LATENT   # noise_mask 포함, 그대로 샘플러에 연결
```

프론트(`graph_builder_minimax.js`)에서 클립마다 이 노드를 끼워 넣고, **디코드는 마지막 클립까지
하지 않는다** — 이게 VAE 왕복이 없다는 것의 실제 의미다. 중간 클립은 latent 상태로만 다음 클립에
넘어간다.

## B4. 릴레이 루프와의 관계

지금 릴레이는 **클립마다 큐를 새로 제출**한다(모델 언로드 회피 목적도 있음). One-Take는 이 구조와
근본적으로 안 맞는다 — latent를 다음 프롬프트로 넘기려면 **하나의 그래프 안에서 클립들이 체인으로
연결**돼야 하고, 큐를 나누면 이전 클립의 in-memory latent를 다음 제출에 넘길 방법이 없다(ComfyUI
프롬프트 간에는 텐서가 유지되지 않음).

두 가지 선택지:

- **A안 — 한 번의 그래프 제출에 N개 클립을 전부 체인으로 엮는다.** 그래프가 커지지만 VRAM은
  이전 클립 latent 하나만 들고 있으면 되므로 감당 가능할 가능성이 높다. `SamplerCustomAdvanced`
  를 N번 체인하고 각 단계에서 `MiniMaxH3LatentContinuation` 을 끼운다.
- **B안 — 저장소처럼 클립별 체크포인트(safetensors)를 디스크에 저장하고, 다음 큐 제출 때
  로드해서 이어간다.** 릴레이 구조를 유지할 수 있고, "중단 후 재개"도 자연히 따라온다 —
  **PART A §A2의 온/오프와 메커니즘이 겹친다.**

**B안을 권한다.** 지금 릴레이 구조(클립마다 새 큐 제출 → VRAM 정리)를 그대로 재사용할 수 있고,
"중단하고 이어서 돌리기" 요구와 메커니즘이 겹친다. latent 체크포인트 저장/로드 노드가 필요하며,
이건 Audio Lock과 마찬가지로 공식 `safetensors` 저장 방식 + `NestedTensor` 직렬화만 있으면 되므로
서드파티 없이 구현 가능하다.

## B5. UI — 새 모드로 노출

기존 세 모드(Text only / First-Last / Reference) 옆에 **One-Take** 를 추가하는 게 아니라,
**Continuity 옵션의 네 번째 값**으로 넣는 편이 지금 구조와 더 잘 맞는다:

```
Continuity between clips: Last Frame Chain / Reference / None / One-Take (latent)
```

One-Take 선택 시:
- 원래 모드(Reference 포함)가 유지된다 — Last Frame Chain처럼 FL2VA로 강제 전환하지 않는다
- Overlap 길이(기본 39프레임) 노출
- Audio Lock 과 동시 사용 가능 — 오디오는 완전 고정, 비디오만 이어붙임 (§B3의 `lock_audio`)
- 스티치 개념이 달라진다: 겹치는 39프레임이 있으므로 단순 concat이 아니라 **겹침 구간을 잘라내는
  스티치**가 필요하다 (저장소의 linear blend까지는 가지 않아도, 최소한 트림은 필요) — A6의
  갤러리 스티치에 "겹침 트림" 옵션으로 얹을 수 있다

## B6. 검증 순서 (구현 전 반드시 먼저)

1. 두 개의 빈 H3 latent를 만들어 하나를 다른 하나 앞부분에 복사하고, `noise_mask` 를 씌운 뒤
   실제 샘플링 — mask=0 구간이 정말 그대로 보존되는지 latent 레벨에서 대조 (Audio Lock 검증 때
   쓴 것과 같은 방법론: 파형이 아니라 latent 값 자체를 비교)
2. 그 다음 실기기로 클립 2개를 이어서, 경계에서 모션이 실제로 연속인지 (지금 Last Frame Chain의
   3.48 픽셀 델타와 비교할 지표를 마련)
3. Reference 모드 유지 확인 — One-Take로 이은 클립이 실제로 레퍼런스 이미지 조건을 계속 받는지

## B7. 하지 않는 것 (이번 범위 밖)

- **AV Bridge** (두 기존 영상 사이 생성) — 저장소에는 있지만 우리 사용 시나리오에 없음
- **20클립 뮤직비디오 전용 프리셋** — One-Take는 범용 메커니즘으로만 넣고, 몇 클립까지
  이을지는 사용자 선택
- **linear blend 스티치** — 겹침 구간 트림까지만. 프레임 블렌딩은 필요성이 확인되면 추후

---

# PART C — Image → Brief 멀티 이미지 + 2단계 LLM 파이프라인

## C0. 실측 — 한 번에 여러 이미지를 보내면 실패한다

qwen3-vl:8b(비전 모델, GPU 로드 확인)에 **한 메시지의 `images` 배열에 이미지 2장을 동시에
넣어** 각각 색상·텍스트를 답하라고 시켰다. 결과:

```
"Wait, the user said 'Two images attached' but the text only shows one.
 Wait, maybe there's a mistake... maybe Image2 is not provided?"
```

모델이 실제로는 **이미지 1장만 봤다.** `images: [b64_1, b64_2]` 형태로 여러 장을 한 메시지에
욱여넣는 방식은 Ollama API 스펙상 허용되지만, 실제 비전 모델이 그걸 "여러 장"으로 인식하는
것과는 별개다 — 최소 이 모델·이 조합에서는 실패한다. 사용자가 예상한 그대로였다.

**결론: 여러 장을 한 번에 보내는 방식은 쓰지 않는다. 이미지마다 별도 호출로 순서대로
분석하고, 그 결과 텍스트들을 합쳐서 다음 단계로 넘긴다.** (아래 §C2)

## C1. 이미지 개수 — 모드에 따라 상한이 다르다

Prompt Edit의 Image → Brief 탭이 지금은 이미지 1장만 받는다. 아래로 바꾼다:

| 항목 | 규칙 |
|---|---|
| 업로드 가능 개수 | 1~8장 |
| **FL 모드** (First/Last) | 최대 **2장**. 브리프 모델에게 "첫 장 = 시작 프레임, 둘째 장 = 끝 프레임"으로 쓰라고 지시 — 결과 프롬프트가 First/Last 서술 형식으로 나오게 |
| **Ref 모드** (Reference) | 최대 **8장**. 기존 시스템 프롬프트의 `<Picture 1>…<Picture N>` 규칙 그대로 — 이미 있는 규칙이라 시스템 프롬프트는 손댈 필요 없음 |

이미지 소스 모드는 **버튼으로 명시적으로 고른다** — 지금 `state.generationMode` 를 그대로
따라가면 사용자가 T2V 모드에서 브리프만 만들고 나중에 Reference로 바꾸는 흐름이 막힌다.
Image → Brief 탭 안에 별도 토글:

```
[ First/Last (최대 2장) ]  [ Reference (최대 8장) ]
```

FL을 고르고 3번째 이미지를 추가하려 하면 업로드 버튼을 비활성화하고 이유를 보여준다.

### UI

기존 `renderImageRow()`(단일 이미지, `state.ollamaImage`)를 다중 슬롯 그리드로 바꾼다.

```js
// before
state.ollamaImage = "filename.jpg" | null

// after
state.ollamaImageMode = "fl" | "ref"        // 위 토글
state.ollamaImages = ["filename1.jpg", "filename2.jpg", ...]   // 순서 = 입력 순서 = <Picture N> 순서
```

각 슬롯: 썸네일 + 순서 번호 배지(`1`, `2`, …) + `✕`. 드래그로 순서 재배열까지는 이번 범위 밖 —
삭제 후 재추가로 순서를 바꾸는 것으로 충분하다.

## C2. 비전 모델 / 브리프 모델 — 두 개로 분리

사용자 지시: `huihui_ai/qwen3vl:8b` 는 이미지 분석 전용, `huihui_ai/gemma-4-abliterated:e4b`
(gemma4)는 텍스트(브리프 작성) 전용으로 **따로 설정**한다. 비전 모델이 이미지를 먼저 분석하고,
그 결과를 브리프 모델이 받아서 최종 프롬프트로 정리한다.

이건 §C0에서 확인한 "한 번에 여러 장 실패" 문제의 해결책이기도 하다 — 이미지마다 비전 모델을
**한 장씩** 호출해서 설명을 뽑고, 그 설명들을 텍스트로 모아 브리프 모델에게 한 번에 준다.
브리프 모델은 이미지를 아예 안 보고 텍스트만 받으므로 비전 모델이 아니어도 된다 — 지금 목록에
있는 텍스트 전용 모델도 브리프 작성용으로 쓸 수 있다는 뜻.

### 상태

```js
ollamaModel:        기존 필드, 의미를 "브리프 작성 모델"로 명확히 함 (텍스트 전용도 가능)
ollamaVisionModel:   신규 — 이미지 분석 전용
```

`ollamaVisionModel` 이 비어 있으면 Image → Brief 탭 자체를 비활성화하고 안내:
`"이미지 분석용 Ollama 모델을 먼저 지정하세요."`

### UI — 모델 선택 두 곳

- **Settings** (`ui_app_settings_minimax.js` 의 `Ollama (prompt enhance)` 섹션 아래): 두 개의
  드롭다운 — `Vision model (image analysis)` / `Brief model (prompt writing)`. 목록은 지금
  `getOllamaModels()` 가 이미 돌려주는 전체 목록 그대로 쓴다 — 비전 전용 필터링은 하지 않는다
  (모델명으로 vision 여부를 안정적으로 구분할 방법이 없음. 사용자가 직접 고른다).
- **Prompt Edit 탭**: 지금 `renderModelSel()` 하나가 있던 자리에 두 개. Text → Brief 탭에서는
  브리프 모델만 보이고, Image → Brief 탭에서는 둘 다 보인다.

### 파이프라인

```
for i, image in enumerate(images):          # §C0 결론에 따라 순차, 병렬 아님
    desc[i] = vision_model.analyze(image, VISION_PROMPT)   # 짧은 사실 위주 서술만 요청

merged = "\n".join(f"Image {i+1}: {desc[i]}" for i in range(len(images)))

final_brief = brief_model.write(
    system_prompt = 기존 MMH3 시스템 프롬프트 (Text→Brief와 동일),
    user_prompt   = buildUserPrompt(...) 에 merged 를 이미지 설명 섹션으로 삽입
                    + FL/Ref 모드에 따른 지시문(§C1)
)
```

**비전 단계의 프롬프트는 브리프 형식을 요구하지 않는다** — "이 사람의 외모·포즈·배경·조명을
사실적으로 서술하라" 정도로 짧게. 형식(Shot 구조, `<Picture N>` 태그 등)은 전부 브리프 모델의
책임으로 남긴다. 두 모델의 역할을 섞으면 비전 모델이 서투른 형식 규칙까지 떠안게 된다.

### 백엔드 — 새 라우트 불필요

기존 `/minimax_h3_one/llm/enhance` 가 이미 `model` · `image_b64` · `system_prompt` ·
`user_prompt` 를 범용으로 받는다. 프론트에서:

1. 이미지마다 이 라우트를 **비전 모델 + 짧은 서술 시스템 프롬프트**로 N번 호출
2. 결과를 합쳐 **브리프 모델 + 기존 MMH3 시스템 프롬프트**로 마지막 1번 호출

즉 백엔드 변경 없이 **프론트 오케스트레이션만으로 구현 가능**하다.

### 진행 표시 — 지금 아예 없다, 전체 Enhance 경로에 다 넣는다

**현재 상태(확인됨)**: `enhBtn.addEventListener("click", ...)`(`ui_prompt_edit_minimax.js:362`)가
버튼 텍스트를 `"⏳ Enhancing…"` 으로 **한 번만** 바꾸고, 응답이 올 때까지 그 상태로 멈춰
있는다. 경과 시간도, 애니메이션도, 몇 번째 단계인지도 안 보인다. 오래 걸리는 비전 모델
호출에서는 "멈춘 건지 도는 건지" 구분이 안 된다 — 지금 겪고 계신 문제 그대로다.

이건 Image → Brief만의 문제가 아니라 **Text → Brief 단일 호출도 마찬가지**다. 이번에 손볼 때
Enhance 경로 전체(텍스트 단일/이미지 순차 파이프라인 둘 다)에 같이 적용한다.

**추가할 것 3가지 — 전부 기존 자산 재사용, 새 CSS 불필요:**

1. **경과 시간 타이머.** 클릭 시점부터 `setInterval` 로 1초마다 버튼 텍스트를 갱신한다.
   `finally` 에서 반드시 `clearInterval` — 실패해도 타이머가 남지 않게.
   ```
   ⏳ Analyzing image 2/3… (14s)
   ⏳ Writing brief… (6s)
   ```
2. **회전 스피너.** `one_node_minimax_h3.js` 에 이미 있는 `@keyframes mmh3-spin` 을 그대로 쓴다
   (새로 정의할 필요 없음). 버튼 앞에 작은 회전 아이콘 하나 — "화면이 안 죽었다"는 걸
   텍스트보다 먼저 눈에 들어오게.
3. **오래 걸릴 때 안내 문구.** 30초를 넘기면 상태줄에 한 줄 추가:
   `"첫 호출은 Ollama가 모델을 VRAM에 올리는 시간이 포함돼 느릴 수 있습니다."`
   실측(§C0)으로 이미 확인됨 — 모델 로드 자체는 0.18초로 빨랐지만(이미 로드돼 있었음),
   **콜드 스타트**(모델이 처음 언로드 상태에서 로드)에서는 이보다 훨씬 걸릴 수 있다.

**요청 자체의 타임아웃은 문제없다** — `api.fetchApi` 는 클라이언트 쪽 타임아웃을 걸지 않고,
백엔드 `/llm/enhance` 가 `timeout=600`(초)으로 이미 넉넉하게 열려 있다(`nodes.py:2091`).
막힌 건 오직 **화면 피드백**이었다.

**적용 범위:**

| 호출 | 진행 표시 |
|---|---|
| Text → Brief (이미지 없음) | 타이머 + 스피너만 (단계 1개라 "N/M" 불필요) |
| Image → Brief, FL/Ref 파이프라인 | 타이머 + 스피너 + 단계 텍스트(`Analyzing image i/N…` → `Writing brief…`) |

## C3. 테스트 체크리스트

- [ ] 비전 모델 미설정 시 Image → Brief 탭이 비활성화되고 안내가 뜸
- [ ] FL 모드에서 3번째 이미지 업로드가 막힘
- [ ] Ref 모드에서 8장까지 업로드되고 9번째가 막힘
- [ ] 이미지 3장으로 실행 시 비전 호출이 정확히 3번(순차) + 브리프 호출 1번
- [ ] 결과 브리프에 각 이미지의 특징이 반영되는지 (예: 색이 다른 이미지 3장 → 브리프가 셋을
      구분해서 언급하는지)
- [ ] FL 모드 결과가 First/Last 서술 형식인지, Ref 모드 결과가 `<Picture N>` 태그를 쓰는지
- [ ] 진행 표시가 단계마다 갱신됨
- [ ] 브리프 모델에 텍스트 전용 모델을 골라도 정상 동작 (이미지 안 보내는 경로 확인)
- [ ] Text → Brief(이미지 없는 경로)에도 경과 시간 타이머 + 스피너가 뜸
- [ ] 30초 초과 시 콜드 스타트 안내 문구가 뜸
- [ ] 실패(에러) 시 타이머가 멈추고 인터벌이 정리됨 (연속 클릭해도 타이머가 중첩 안 됨)

## C5. 발견 — 네이티브 CLIP 경로는 진짜로 멀티 이미지가 된다 (결정 필요)

빌드 도중 사용자가 실제 ComfyUI 그래프에서 발견한 것: `Multi Image Loader (TJ)` 로 이미지 3장을
하나의 IMAGE 배치로 묶고, `Generate Text`(**ComfyUI 코어 네이티브 노드**, `comfy_extras/
nodes_textgen.py` 의 `TextGenerate` — TJ_NODE 아님) 에 그 배치를 통째로 넣었더니 **3장을 각각
정확히 구분해서** 설명이 나왔다. `Load CLIP` 은 `type: minimax` — **MiniMax H3가 텍스트
인코딩에 쓰는 것과 같은 로더 계열**로 Qwen3-VL을 올린 것이었다.

```python
# comfy_extras/nodes_textgen.py — TextGenerate.execute()
tokens = clip.tokenize(prompt, image=image, ...)      # image = IMAGE 배치, 통째로
generated_ids = clip.generate(tokens, ...)
generated_text = clip.decode(generated_ids)
```

**§C0에서 실패했던 것과 정확히 대비된다:**

| | Ollama `/api/chat` (§C0, 이미 구현) | 네이티브 CLIP `TextGenerate` (신규 발견) |
|---|---|---|
| 여러 장 처리 | 한 메시지에 `images:[b64,b64]` 넣으면 **1장만 봄** (실측 실패) | 배치로 넣으면 **각 장 정확히 구분** (실측 성공, 3장) |
| 실행 위치 | 외부 Ollama HTTP 서버 | ComfyUI 프로세스 내부, `clip` 오브젝트 직접 호출 |
| 모델 관리 | Ollama가 별도로 VRAM에 로드·언로드 | ComfyUI의 기존 모델 로딩/언로드 정책을 그대로 씀 |
| 필요 조건 | Ollama 서버 + 비전 모델 pull | vision-capable CLIP 체크포인트 (예: Qwen3-VL) |
| 우리 구조와의 관계 | 완전히 별도 스택 (HTTP 프록시만) | **MiniMax H3가 이미 쓰는 CLIPLoader 계열과 같은 종류** |

### 왜 지금 §C1~C4 를 안 뜯어고치고 여기 따로 적는가

Part C의 파이프라인(C1~C4)은 이미 구현·문법 검증까지 끝났고, Ollama 기반이라 **Ollama 서버만
있으면 어떤 환경에서도 동작**한다는 장점이 있다 — vision CLIP 체크포인트를 새로 받을 필요가
없다. 반면 네이티브 경로는 진짜 멀티 이미지가 되지만 **그래프 실행**이 필요하다:
`LoadImage` 여러 장 → 배치 노드 → `TextGenerate` 를 API 그래프로 조립해서 `queuePrompt` 로
제출하고 결과를 기다려야 한다 — 지금처럼 JS에서 `/llm/enhance` 를 툭 던지고 몇 초 안에 받는
가벼운 구조가 아니라, **본 생성과 같은 큐 대기·모델 로드 시간**이 들어간다.

즉 두 경로는 트레이드오프가 다르다:

| | Ollama 경로 (C1~C4, 구현됨) | 네이티브 CLIP 경로 (신규, 미구현) |
|---|---|---|
| 멀티 이미지 정확도 | 순차 우회로 해결 (동시엔 안 됨) | **진짜 동시 처리, 검증됨** |
| 응답 속도 | 수 초~수십 초 (HTTP) | 큐 대기 + 모델 로드 포함, 더 걸릴 수 있음 |
| 추가 설치 | Ollama 서버만 | vision-capable CLIP 체크포인트 (모델 용량) |
| VRAM | 비전 모델이 Ollama 쪽에서 별도로 차지 | 본 생성 모델과 VRAM을 나눠 씀 (경합 가능) |
| 구현 난이도 | 완료 | 그래프 조립 + `queuePrompt` 대기 로직 필요 (새로 작성) |

### 결정됨 — 구현 완료 (교체가 아니라 소스 선택)

실기기에서 사용자가 직접 배치 3장으로 재현·확인. **Ollama를 없애지 않고 둘 다 유지**, Settings에
`Image → Brief — vision source` 토글(Ollama / Native)을 추가해서 고르게 했다. 어느 쪽을 골라도
**같은 두 역할 구조**를 유지한다 — Ollama는 (브리프 모델, 비전 모델), Native는 (브리프 CLIP,
비전 CLIP). 각 CLIP은 `text_encoders` 목록에서 고르며(MiniMax H3의 텍스트 인코더와 같은 종류,
재사용해도 되고 따로 둬도 됨), Native 쪽에 필요한 노드(`TJ_MultiImageLoader` · `TextGenerate` ·
자체 `TJStudioOneTextOutput`)가 없으면 그 사실을 바로 보여주고 막는다.

구현:

- `nodes.py` — `TJStudioOneTextOutput` 신설(STRING → UI 패스스루, `TextGenerate` 결과를
  `queuePrompt()` 의 `executed` 이벤트로 받기 위한 터미널 노드). `MMH3_OPTIONAL_NODES` 에
  `TJ_MultiImageLoader` · `TextGenerate` · `TJStudioOneTextOutput` 등록.
- `api_minimax.js` — 같은 세 이름을 프론트 쪽 `MMH3_OPTIONAL_NODES` 에도 등록(빠뜨리면 백엔드는
  알아도 UI가 못 보는 문제가 Audio Lock 때 한 번 있었음). `analyzeImagesNative()` /
  `writeBriefNative()` 추가 — 둘 다 `CLIPLoader(type=minimax)` → `TextGenerate` →
  `TJStudioOneTextOutput` 3~4노드짜리 그래프를 조립해 기존 `queuePrompt()` 로 제출.
  `analyzeImagesNative` 는 이미지들을 먼저 `TJ_MultiImageLoader` 로 배치에 묶는다.
- `core_minimax.js` — `visionSource`("ollama"/"native"), `nativeVisionClip`, `nativeBriefClip`.
- `ui_app_settings_minimax.js` — 소스 토글 + 토글에 따라 바뀌는 두 피커(Ollama 모델 쌍 /
  Native CLIP 쌍, 둘 다 기존 `searchableSelect` 재사용).
- `ui_prompt_edit_minimax.js` — Enhance 클릭 핸들러가 `visionSource` 로 분기. Native 쪽 비전
  단계는 **이미지 전부를 한 번에** 배치로 보낸다(순차 아님) — 이게 네이티브 경로를 쓰는 이유.
  브리프 작성 단계는 이미지가 없는 같은 그래프 패턴(`writeBriefNative`)으로 동일하게 처리.

**검증 완료 (실기기)**: ComfyUI 재시작 후 `TJ_MultiImageLoader`/`TextGenerate`/
`TJStudioOneTextOutput` 가용성 확인, `Qwen3\qwen_3vl_8b_nvfp4.safetensors`(비전) /
`LTX\gemma4_e2b_it_bf16.safetensors`(브리프) 조합으로 실제 노드 생성 → 이미지 2장(빨간 사각형 /
파란 사각형) 업로드 → Enhance 클릭 → 큐 제출·완료(`analyzeImagesNative` 배치 1회 호출 +
`writeBriefNative` 1회 호출) → 리뷰 다이얼로그에 결과 확인. 두 이미지를 정확히 구분했고
(`<Picture 1>`=red, `<Picture 2>`=blue), `image_paths_json` 파일명 resolve 정상, `TextGenerate`
의 `sampling_mode.*` 점 표기 그래프 검증 통과. `gemma4_e2b_it_bf16` 이 MMH3 시스템 프롬프트
포맷(COMMON HEADER의 subject_definitions/summary/retention_analysis/detailed_description,
`[Shot N]` 구조, 타임스탬프, `overall_soundscape`/`non_diegetic_music` 꼬리말)을 정확히 따름 —
시스템 프롬프트 이행 검사도 통과. 이에 따라 `core_minimax.js` 의 `nativeVisionClip`/
`nativeBriefClip` 기본값을 이 두 체크포인트로 설정함(`visionSource` 자체의 기본값은 `"ollama"`
유지 — 네이티브로 전환 시에만 두 값이 미리 채워짐).

## C4. 하지 않는 것

- **비전 모델 자동 필터링** — 모델명만으로 vision 지원 여부를 안정적으로 판별할 수 없어
  사용자가 직접 고르게 한다.
- **이미지 순서 드래그 재배열** — 삭제 후 재추가로 대체.
- **병렬 비전 호출** — §C0에서 확인된 문제를 우회하는 설계이므로, 병렬화는 이 설계의 전제를
  깨뜨린다. 나중에 진짜 멀티이미지 비전 모델이 검증되면 별도로 재검토.

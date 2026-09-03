# CHANGELOG — ComfyUI-TJ_NODE_STUDIO_ONE

---

## v1.23.4 (2026-09-03)

- **`install_requirements.bat` — numpy version read no longer errors on ComfyUI Desktop.**
  `for /f %%v in ('"%PYTHON%" -m pip show numpy ^| findstr ...')` mangles under `cmd /c`
  when the first token is a quoted path (a `.venv\Scripts\python.exe`), printing
  "The filename, directory name, or volume label syntax is incorrect" and leaving the
  numpy guard disabled. Now goes through a temp file + a `:GET_NUMPY_VER` subroutine
  whose first token is unquoted `findstr`.

---

## v1.23.3 (2026-09-03)

- **`install_requirements.bat` / `.sh` now find the right Python on ComfyUI Desktop.**
  - Accepts the ComfyUI folder as the first argument
    (`install_requirements.bat "D:\ComfyUI-Desktop\ComfyUI"`); without one it derives the
    folder from where the script sits, as before. A `main.py` check rejects a wrong path.
  - Python discovery order: `<ComfyUI>\venv` / `.venv` (ComfyUI Desktop runs from a uv
    `.venv` whose base is `standalone-env` — packages must land in the `.venv`, not the
    bare `standalone-env`), then `<base>\venv` / `.venv` / `standalone-env`, then
    `python_embeded` in or beside ComfyUI (portable). `<base>` = the folder above ComfyUI.
  - The system-Python fallback is **no longer automatic** — if none of the above is
    found it names the system Python and asks Y/N; anything but Yes skips every pip step
    (node repos are still cloned). Silently using the system Python was the actual
    Desktop bug: deps went to the wrong interpreter and ComfyUI never saw them.
- Both scripts are ASCII-only now (no code-page-dependent characters).

---

## v1.23.2 (2026-09-02)

- **"Also save the clip before deblur / upscale" (왼쪽 패널 Upscale 아코디언).** 인라인
  deblur/upscale를 걸었을 때, 후처리 전 원본 클립을 `_raw` 파일로 하나 더 저장할지 선택.
  체크 시 그래프에 두 번째 SaveVideo를 붙여 디코드 직후 프레임을 그대로 저장하고, 그
  사이드카는 `unprocessed: true` + `processedSibling`(최종본 파일명) + 자기 해상도만
  기록합니다(`sourceW/H` 없음, 뱃지 없음). 스티치·라스트프레임 체인에는 절대 안 들어가고
  최종본이 계속 "진짜 클립"입니다. deblur/upscale 둘 다 None이면 옵션 자체가 안 보임.
- **갤러리 썸네일에 인터폴레이션 뱃지 `⇄` 추가.** 좌하단 뱃지가 이제 `⇪`(업스케일) /
  `✧`(디블러) / `⇄`(인터폴레이션) 세 종류. ⓘ 툴팁의 `⚙` 줄도 인터폴레이션을 포함합니다.
- **버그 수정 — 갤러리 `⬆ Upscale` 버튼이 계속 비활성.** `refreshUpBar`에서 `ready`가
  `noUpscale` / `deblurOn` / `deblurOk`를 선언보다 먼저 참조(TDZ) → 매 호출마다
  `ReferenceError`로 던져 버튼 `disabled`가 영영 안 풀렸습니다(v1.20.0부터). 선언 순서
  교정. (Deblur 전용 `✦ Deblur` 버튼도 같은 함수라 함께 정상화.)
- 인라인 `_raw` 저장 시 `reconcileGeometry`에 `noSource` 옵션 추가 — 원본 클립은 그 자체가
  원본이므로 재프로브한 크기 차이를 `sourceW/H`로 기록하지 않습니다.

---

## v1.23.1 (2026-09-02)

- **생성 시점에 인라인 deblur / upscale를 건 클립의 메타가 실제 결과를 반영합니다.**
  - `buildClipGraph`가 그래프에 실제로 배선한 프레임 후처리를 메타에 기록: `deblur`
    (강도 문자열 | null), `upscale` (`{method:"model",model}` | `{method:"rtx",scale,quality}`
    | null).
  - 생성 저장 경로: upscale가 걸렸을 때 출력 파일을 재프로브(`getVideoInfo`)해서
    `w/h/frames/fps`를 실제 값으로 덮어쓰고, upscale 전 크기를 `sourceW/sourceH`로 보존.
    deblur는 크기를 안 바꾸므로 프로브 생략. One-Take·Extend 스티치 출력에도 동일 적용
    (One-Take는 오버랩 계산된 durationSeconds 유지).
  - `reuseAll`: 인라인 pass로 만든 클립을 Reuse하면 `deblurStrength` / `upscaleMode` /
    `upscaleModel` / `rtxScale` / `rtxQuality`까지 복원. 갤러리 후처리 파일(`postProcess`
    있음)은 §5대로 원본을 복원.
- **갤러리 후처리 메타가 어떤 단계가 돌았는지 명시적으로 기록.** deblur→upscale 결합
  실행이 이제 `postProcess: "deblur + upscale"`로 남고, `deblur` / `upscale` /
  `interpolate` 구조화 필드도 함께 기록됩니다(전엔 `"upscale"` 하나로 뭉개져 deblur 정보
  유실). `sourceW/sourceH`는 실제로 크기가 바뀐 경우에만 기록.
- **갤러리 썸네일 좌하단 뱃지.** `⇪` = 업스케일됨, `✧` = 디블러됨(둘 다 표시 가능).
  생성 시 인라인이든 갤러리 후처리든 동일한 메타 키를 읽으므로 두 경로가 똑같이 보입니다.
  ⓘ 툴팁도 인라인 pass를 인식하도록 보강.

---

## v1.23.0 (2026-09-02)

- **Prompt Edit — 클립 순서를 드래그로 바꿀 수 있습니다.** CLIPS 목록의 각 행을 드래그해서
  놓으면 그 위치로 순서가 바뀝니다. 선택 중인 클립은 이동해도 계속 선택 상태로 따라갑니다.
- **CLIPS 행 표시를 `N - Clip Prompt #N` 형식으로 단순화.** 각 클립 프롬프트의 앞부분을
  잘라 보여주던 미리보기 텍스트 대신, 번호만 보고 바로 알아볼 수 있는 고정 라벨입니다.
- **이미지 / 비디오 / 오디오 첨부 순서도 드래그로 변경.** 왼쪽 패널의 Reference 이미지
  그리드, Prompt Edit의 이미지 그리드(공용 · 클립별 오버라이드 모두), 비디오/오디오 3슬롯
  (왼쪽 패널과 Prompt Edit이 공유하는 컴포넌트)에서 채워진 슬롯을 드래그해 자리를 바꿀 수
  있습니다. 이미지의 번호는 `<Picture N>` 프롬프트 토큰과 그대로 연결되어 있어, 순서를
  바꾸면 프롬프트가 가리키는 대상도 실제로 바뀝니다.
- **메인 화면 미리보기 영역 높이를 드래그로 조절.** 현재 높이가 최대값이고, 미리보기 박스
  하단 가장자리를 위로 끌면 줄어들며 그만큼 아래 PROMPTS 목록이 넓어집니다(전체 노드
  높이는 그대로). 다음에 열 때도 마지막으로 맞춘 높이를 기억합니다.

---

## v1.22.4 (2026-09-01)

- **`Sampling · step N/M` 총 스텝 수가 이제 정확합니다.** ComfyUI의 `progress` 이벤트는
  `{value, max, node, prompt_id}`인데, 여기서 `node`를 안 보고 `max`만 읽어 진행률 콜백에
  넘기고 있었습니다. 그래서 스텝 프리뷰 오버라이드·비디오 VAEDecode(라틴트 프레임 수만큼
  틱)·업스케일/디블러 노드가 같은 판독값에 끼어들어 `38/60`, `7/8` 같은 엉뚱한 숫자가
  떴습니다. `queuePrompt` / `waitForHistory`에 `samplerNode` 옵션을 추가해
  `SamplerCustomAdvanced`(`MM:sampler`)의 틱만 통과시킵니다. 샘플러 id를 모르는 경우
  (그래프 없는 재접속)엔 종전대로 전부 통과.

---

## v1.22.3 (2026-09-01)

- **설정 → Models의 PDD Acc file 저장이 실제로 유지됩니다.** `mmh3_save_config`는 값을
  `config_minimax_h3.json`에 쓰고 있었지만 `mmh3_get_config` 응답 딕셔너리에 `pdd_file` /
  `pdd_file_reference` / `pdd_nfe` / `pdd_lora_strength` / `pdd_head_strength` 키가 빠져
  있어, 새로고침하면 항상 `none`으로 되돌아갔습니다(localStorage 덕에 같은 세션에서만
  유지되던 것). 다섯 키를 GET 응답에 추가.

---

## v1.22.2 (2026-09-01)

- 필드별 `Undo` / `Clear` 버튼 글씨 색이 상태를 따라갑니다: 지울 내용이 있으면 `Clear`가
  흰색(없으면 회색), 되돌릴 값이 있으면 `Undo`가 흰색(없으면 회색). 입력·포커스·클립 전환
  때마다 갱신.

---

## v1.22.1 (2026-09-01)

- **Prompt Edit — 필드별 Undo / Clear.** 헤더 · 사운드/뮤직 · 샷(클립 에디터) 세 필드
  각각의 라벨 우측 상단에 `Undo` / `Clear` 버튼. Clear는 그 필드만 비우고, Undo는 그
  필드에 포커스했던 시점 값 / Clear 직전 값으로 되돌립니다(필드별 최대 15단계). 샷 필드의
  undo 스택은 클립을 전환하면 초기화돼 다른 클립 값으로 되돌아가지 않습니다.

---

## v1.22.0 (2026-09-01)

### Prompt Edit — Enhance 결과를 어떻게 넣을지 마지막에 선택

Enhance 결과 리뷰 화면 하단(Discard / Apply 바로 위)에 **적용 방식 3모드**를 넣었습니다.
카드(HEADER / CLIP N / SOUND·MUSIC)는 모드와 무관하게 항상 미리보기로 보이고, 적용
방식만 마지막에 고릅니다.

- **1. One Prompt** — 결과 전체(헤더+샷+풋)를 한 덩어리로 현재 클립의 샷 필드에만.
  헤더/풋은 건드리지 않습니다.
- **2. Auto Split** (기본) — 지금처럼 헤더 / 샷들 / 사운드·뮤직으로 자동 분리 배치.
- **3. Use selected** — 결과 카드를 클릭해서 고른 것만 적용. 체크박스가 아니라 카드
  클릭 = 토글이고, 선택된 카드는 굵은 보라 테두리, 선택 해제된 카드는 회색 테두리 +
  검은 스크림으로 비활성 표시. 3모드 진입 시 전부 선택 상태로 시작합니다.

`split into all clips`로 목표 길이를 넣었을 때 모델이 그만큼의 샷을 안 쓰는 경우
("2개 요청했는데 1개 씀")를 리뷰 상단에 경고로 표시합니다.

### 브리핑 파싱 — 구조형 오디오 섹션 인식

`parseBrief`가 간단형(`Ambient sound:` / `Music:`)만 알던 것을 고쳐, 구조형
(`overall_soundscape:` / `non_diegetic_music:`, 마크다운/언더스코어 변형 포함)도
공통 사운드·뮤직 꼬리로 분리합니다. 모델이 끝에 되풀이하는 지시문
(`Target duration:` · `Write exactly N shots` · `Image N:` 등)은 잘라냅니다.

---

## v1.21.7 (2026-09-01)

- **후처리(단일 실행) 작업이 페이지 리로드를 견딥니다.** 업스케일·디블러의 메타 저장은
  렌더가 끝난 뒤 브라우저가 씁니다 — 그 전에 탭을 새로고침하거나 ComfyUI Manager 재부팅
  (프론트엔드 리로드)이 끼면 결과 mp4는 만들어지는데 메타가 `{}`로 남았습니다. 이제 큐에
  넣을 때 `{promptId, saveNode, 소스, 소스메타}`를 localStorage에 저장하고, 갤러리가 다음에
  열릴 때 `resumePostJob()`이 `/history`로 재접속해 마무리(크기 재측정 → 메타 기록 → input
  복사본 정리)합니다. 일반 렌더의 재개 경로와 동일. 진행 표시에 "keep this tab open" 추가.
  청크 작업은 재개 불가(슬라이싱 루프를 다시 재생해야 함) — 경고 문구로 커버.

---

## v1.21.6 (2026-09-01)

- **후처리 결과물의 ⓘ 정보가 출력 크기를 보여줍니다.** `runPost`의 메타 저장이 소스 메타를
  그대로 복사해서(§5, Reuse가 원본을 복원하도록) 업스케일·보간 결과물의 w/h/frames/fps가
  소스 값 그대로였습니다. 이제 완료 파일을 `video_info`로 재측정해 그 값들을 덮어쓰고,
  `sourceW`/`sourceH`와 `postProcess`를 추가합니다. ⓘ 팝업에 "⚙ upscale (from 1440×960)"
  / "N frames @ Mfps" 표시. 프롬프트·시드·파이프라인은 여전히 소스 것(Reuse용). 기존
  파일은 그대로, 새 실행부터 정정.

---

## v1.21.5 (2026-09-01)

- **후처리 청킹 규칙을 소스 길이 기준으로 확정** (v1.21.4의 RAM 예산 방식 대체):
  - RTX VSR / RTX 디블러: `< 15s` 통짜, `>= 15s` 15초 청크
  - 업스케일 모델: `< 10s` 통짜, `>= 10s` 5초 청크 (디블러+모델은 모델 규칙 우선)
  - 보간: 규칙 없음 — 기존 바이트 예산 방식 유지
  웹 트윈과 동일 규칙. v1.21.4의 `/history` 폴링 안전망은 그대로.

---

## v1.21.4 (2026-09-01)

### 갤러리 후처리 — 짧은 클립이 불필요하게 청크로 쪼개지지 않습니다

- §16 청크 크기가 고정 1.25 GB 예산 + 입력 프레임 크기만 봤습니다. 8초 / 1.3 MP 클립도
  3-4 청크로 쪼개져 진행 표시 없이 6-8분씩 걸렸습니다.
- 이제 예산은 **비어 있는 시스템 RAM의 일부**(`/vram_stats` 기준, 3-32 GB 범위)이고,
  프레임당 크기는 **입력 + 후처리 출력**을 함께 셉니다(업스케일 배율²·보간 배수). 64 GB
  기기의 일반 8초 2x 업스케일은 단일 실행, 스티치 풀런·4K·4x는 여전히 청크.
- iOS Safari에서 긴 청크 도중 웹소켓이 끊기면 `execution_success` 이벤트가 안 와서
  후처리 루프가 "chunk 1/N 준비 중"에서 영구히 멈추던 문제 — `queuePrompt`에 5초
  `/history` 폴링 안전망 추가(웹소켓이 오면 그대로 즉시 반환).

---

## v1.21.3 (2026-09-01)

- **Stitched videos now play on iOS Safari.** `mmh3_stitch` wrote the mp4 `moov` atom
  after `mdat` in every branch — desktop browsers seek back for it, iOS Safari refuses to
  play the file over HTTP (broken-play triangle in the fullscreen player). Added
  `-movflags +faststart` to all three ffmpeg paths (stream-copy concat, trim/overlap
  re-encode, audio-override). Affects One-Take auto-stitch, gallery Extend, manual Combine
  and the chunked upscale/deblur/interpolate joins. Individual clips were already fine
  (ComfyUI's SaveVideo faststarts them).

---

## v1.21.2 (2026-09-01)

- **Reuse now reproduces a clip's turbo config.** `metaForVideo` recorded `turboMode`
  but not the fields turbo needs to actually engage — the turbo/PDD model files, the
  turbo step counts, `pddNfe` — nor `scheduler` / `denoise` / `shift`. So reusing a PDD
  clip restored `turboMode="pdd"` with no file, `effectiveTurbo()` fell back to none, and
  it re-rendered at the normal step count. All of these are saved and restored now.
  (`reuseAll` already had the restore code for the turbo LoRA fields — it was dead because
  nothing wrote them.)

---

## v1.21.1 (2026-09-01)

- **Extend keeps the source's accelerator.** Extend always renders First/Last, but a
  source clip made in Reference mode keeps its turbo LoRA / PDD file in the *reference*
  slots, which First/Last never reads — so the continuation quietly dropped to no
  accelerator. `runExtend` now copies `pddFileReference` → `pddFile` and
  `turboLoraReference` → `turboLora` when the First/Last slot is empty.

---

## v1.21.0 (2026-09-01)

### MiniMax H3 — 이어서 생성 (Continue) + 갤러리 Extend

- **Prompt Edit: "▶ Continue generating the clip"** — 첫 프레임 슬롯의 `⬆ Upload override`가
  `Select from the gallery` 로 바뀌었습니다. 완료된 클립을 고르면 그 클립의 마지막 프레임이
  현재 클립의 시작으로 들어가고, **앞 클립은 자동으로 꺼지며**(오버라이드 체크박스도 회색),
  이 클립부터 켜집니다. `✕` 로 되돌리면 껐던 클립이 복원됩니다. 멈춘 멀티클립 런을 프리셋
  다시 불러서 4번부터 이어 돌릴 때, `MMH3_clipNNN_last_*.png` 를 손으로 찾을 필요가 없습니다.
- **갤러리 카드: `↩ Reuse` / `⧉ Copy` / `⏭ Extend` 3칸.** Extend 는 프롬프트 한 줄만 받는
  작은 팝업(시드 프레임 썸네일 + `LLM: Review` / `LLM: Auto`)을 띄우고, 확정하면 소스 설정을
  그대로 물려받아 연장 클립 1개를 렌더한 뒤 **[소스 + 연장]을 자동으로 스티치**합니다 —
  5초 + 5초 = 10초짜리 한 파일. 메타에는 두 프롬프트가 `[Clip N]` 으로 저장됩니다(§5).
- 새 라우트 `POST /minimax_h3_one/clip_last_frame` — 클립의 저장된 마지막 프레임을 찾아
  `input/` 으로 복사(없으면 ffmpeg 추출).
- 스티치가 클립마다 크기가 달라도 첫 클립 기준으로 scale+pad 하도록 보강 — 갤러리 수동
  Combine 도 함께 견고해집니다.

### 사용자 파이프라인 프리셋이 왼쪽 패널 설정을 전부 담습니다

- 지금까지 사용자 프리셋은 가속 축(터보/어텐션/캐시/Spectrum 등)만 저장했습니다. 이제
  **샘플러 · 스케줄러 · denoise · steps · shift(video/audio) · 터보 스텝 수 · 터보/PDD 모델
  파일**까지 저장·복원합니다.
  - 이전에는 `turboMode="pdd"` 만 복원되고 PDD 파일은 복원 안 돼서, 프리셋을 적용해도
    `effectiveTurbo` 가 조용히 `none` 으로 떨어져 **8스텝 대신 20스텝**으로 돌던 문제가
    있었습니다.
- **내장 6개 프리셋은 그대로** 가속 축만 씁니다(벤치마크 비교용이라 steps/샘플러를 건드리면
  안 됨). `matchPreset` 도 축 기준 그대로입니다.

### 수정

- `set_last_image` 라우트가 정의되지 않은 `_mmh3_last` 를 참조해 mmh3 렌더가 끝날 때마다
  `NameError` 를 던지고 노드의 last-frame 출력이 깨지던 문제 수정.

---

## v1.20.4 (2026-08-31)

### 의존성 배너의 안내 팝업 제거 (ClickFix 오탐)

- v1.20.3이 Copy 후 띄우던 단계별 팝업("실행 창 열고 붙여넣고 실행")은 ClickFix
  소셜 엔지니어링 수법과 문구 패턴이 같아서 Windows Defender가 해당 파일을
  격리했습니다(Behavior:Win32/ClickFix). 스캐너가 노드 팩을 플래그하는 원인일
  가능성도 있습니다.
- 팝업을 없앴습니다. 배너는 이제 스크립트 **경로**와 Copy 버튼, 그리고
  "터미널에서 실행 후 ComfyUI 재시작" 한 줄만 보여줍니다. Copy를 누르면 짧은
  토스트로 같은 안내만 뜹니다.

---

## v1.20.3 (2026-08-31)

### 의존성 경고에 복사 버튼

- 노드의 빨간/주황 경고 배너에서 스크립트 경로 두 줄(Windows / Mac·Linux) 각각 옆에
  **⧉ Copy** 버튼.
- (v1.20.4에서 Copy 후 팝업은 제거 — 아래 참고.)

### install_requirements가 numpy를 되돌립니다

- insightface·onnx·구형 RTX 의존성이 numpy를 올리거나 내리는 경우가 있습니다. ComfyUI와
  다수 노드는 여전히 numpy 1.x를 요구합니다. 스크립트가 시작 시 numpy 버전을 기록하고,
  설치 뒤 바뀌었으면 **원래 버전으로 재설치**합니다. 실패하면 실행할 명령을 알려줍니다.

---

## v1.20.2 (2026-08-31)

### 의존성 노드 누락 경고를 노드 화면에 직접 표시합니다

- v1.20.1의 시작 로그 배너는 놓치기 쉽습니다. MiniMax H3 노드 상단에 **의존성 팩이
  빠졌을 때 사라지지 않는 경고 스트립**을 추가했습니다. 필수 노드가 없으면 빨간색
  (렌더 불가), 선택 노드만 없으면 주황색입니다.
- 경고에 **실행할 파일의 전체 경로**를 함께 보여줍니다:
  `<패키지 폴더>\install_requirements.bat` / `bash "<패키지 폴더>/install_requirements.sh"`.
  세션 동안 `✕`로 닫을 수 있습니다.
- Settings ⚙ → Third-party pack status 패널도 같은 경로·명령을 표시하고, 이제 누락된
  **필수** 노드도 함께 알립니다.
- `/minimax_h3_one/node_availability` 응답에 `install_dir` · 스크립트 이름 추가.

### install_requirements가 ComfyUI-TJ_NODE도 설치합니다

- `TJ_FreeTextEncoderVRAM` · `TJ_RTXDeblur` · H3 Audio Lock · One-Take · `TJ_MultiImageLoader`
  등은 형제 팩 **ComfyUI-TJ_NODE**에 있는데, 설치 스크립트 목록에 빠져 있어서 스크립트를
  돌려도 이 노드들이 계속 "not installed"로 남았습니다. 목록에 추가했습니다.
- `MMH3_OPTIONAL_NODES`의 중복 항목(`TJ_FreeTextEncoderVRAM` 2회) 제거.

---

## v1.20.1 (2026-08-31)

### 의존성 노드 누락을 시작 시 알립니다

- ComfyUI-Manager는 이 패키지를 설치할 때 Python 패키지는 자동으로 깔지만, 이 노드가
  의존하는 **다른 커스텀 노드 팩은 자동으로 설치하지 않습니다** (nightly/git 설치 경로에
  해당 기능이 없음). 지금까지는 노드는 뜨는데 Face Redraw · Faceswap · ControlNet ·
  RE-BG · Upscale · MiniMax H3 Reference 등이 조용히 로드에 실패했습니다.
- ComfyUI 시작 시 콘솔에 **어떤 팩이 빠졌는지 배너로 표시**합니다 (`dependency_check.py`).
  필수 팩과 선택 팩을 구분하고, `install_requirements.bat` / `.sh` 실행을 안내합니다.
- 이 점검은 `custom_nodes/` 폴더의 **이름만** 읽습니다 — 파일 내용 · 쓰기 · 네트워크 ·
  subprocess 없음. 실패해도 노드 로딩을 막지 않습니다.
- README 상단에 같은 내용의 경고 섹션을 추가했습니다.

---

## v1.20.0 (2026-08-31)

### MiniMax H3 — 클립별 레퍼런스 오버라이드

- **클립마다 자기 전용 레퍼런스를 쓸 수 있습니다.** Prompt Edit 첨부 영역에 `override for
  this clip` 체크박스 추가. 체크하면 그 클립은 왼쪽 패널의 공통 세트 대신 자기 이미지 ·
  first/last frame · 비디오 · 오디오를 씁니다. 처음 체크할 때 공통 세트를 복사해 채웁니다.
  - **all-or-nothing** — 자산별로 공통에 폴백하지 않습니다. 눈에 보이지 않는 혼합이
    잘못된 렌더를 늦게 발견하게 만드는 원인입니다.
  - 머리말이 상태를 말합니다: `Common (shared by all clips)` ↔ `This clip only`.
  - 렌더 루프 · 에디터 · 메타데이터가 모두 `clipAssets()` 하나를 통과합니다.
- **헤더와 사운드/뮤직 테일도 오버라이드를 따라갑니다.** 둘 다 레퍼런스 이미지가 세우는
  장면을 서술하므로, 이미지만 바꾸고 공통 헤더를 그대로 쓰면 이전 샷의 설정과 음악이 새
  장면 위에 덮어써집니다. 라벨도 `COMMON —` ↔ `THIS CLIP —`으로 바뀝니다.

### Reuse가 이미지를 복원합니다

- 메타데이터에 `refImages` / `refImagesMp` / `firstFrameImage` / `lastFrameImage` /
  `refVideos` / `refAudios` 추가. 지금까지 Reference 모드의 "이 클립 그대로 다시"는 실제로
  아무것도 재현하지 못했습니다.
- **업스케일 · 디블러** 결과는 원본 클립의 메타를 그대로 복사합니다.
- **스티치** 결과는 원본 메타를 복사하고, 프롬포트는 각 원본의 합성 프롬포트를 `[Clip N]`
  구분자로 이어 붙입니다. 그 파일을 Reuse하면 **프롬포트 1 / 프롬포트 2로 분리 복원**되고
  마커는 제거됩니다.

### 프롬포트 세트가 첨부 파일까지 저장/로딩합니다

- Prompt Edit 상단의 Load / Save / Delete가 글자만 저장하던 것을 고쳤습니다. 이제
  이미지 · 비디오 · 오디오 · first/last frame · 모드 · 레퍼런스 타입까지 함께 오갑니다.
- **없어진 파일은 고스트 썸네일로 알립니다.** 빈 칸으로 두면 사진 3장을 쓰던 세트인지
  0장이던 세트인지 구분할 수 없습니다. 주황 점선 타일에 ⚠와 파일명을 남기고, 호버하면 전체
  이름이 뜹니다. 번호와 ✕는 그대로라 바로 지우거나 다시 채울 수 있습니다.
- 자산 필드가 없는 **구버전 세트를 열 때는 화면의 이미지를 건드리지 않습니다.**

### 레퍼런스 비디오 / 오디오 입력 전면 교체

- 세로로 길던 폼을 **이미지 칸과 같은 썸네일 타일**로 바꿨습니다. Prompt Edit(클립 전용)과
  왼쪽 패널(공통) 양쪽에 같은 슬롯을 씁니다.
- 비디오는 프레임을 보여주고 **마우스 오버 시 무음 재생**, 🖼 버튼으로 미니맥스 갤러리에서
  바로 고를 수 있습니다. 오디오는 썸네일 대신 파일명을 표시합니다.
- 타일 아래로 재생/정지 토글 · 처음부터 · 재생시간 · (오디오)스크럽 바 · in · out ·
  소스 정보가 한 줄씩 놓입니다.
- **in/out은 이 타일이 재생하는 구간입니다.** 재생 · 스크럽 · 시계가 모두 `[in, out]`
  안에서만 움직이고, 값을 고치면 즉시 반영됩니다. 시계는 구간 내 경과 / 구간 길이입니다.
- 파일을 처음 넣으면 **in = 0, out = 전체 길이**로 채워집니다. out은 파일 길이를 넘을 수
  없습니다(입력 클램프 + `max` 속성 + 로드 시 교정).

### Ollama 제거

- Image → Brief의 외부 Ollama 백엔드를 제거하고 ComfyUI 내부 경로만 남겼습니다. 별도 서버가
  필요했고, LLM이 둘이면 클립별 오버라이드가 불필요하게 복잡해집니다.
- `vision_source` 기본값을 `native`로 고정. UI 표기는 `LOCAL ENHANCE (native CLIP)`.

### UI

- **노드 폭 +25%** (1000 → 1250px). 늘어난 폭은 프리뷰가 흡수하고 왼쪽 패널은 그대로입니다.
- **노드 전체화면** — 브라우저 전체화면이 아니라 노드를 화면에 꽉 차게 확대합니다. 종료는
  토글 버튼으로만 (Esc나 여백 클릭은 작업 중 실수로 터집니다).
- **파이프라인 프리셋 저장/관리** — 직접 만든 프리셋을 저장 · 이름변경 · 순서변경 · 삭제할
  수 있습니다. `── User Preset ──` / `── System Preset ──` 구분자는 선택되지 않습니다.
- **Prompt Edit 레이아웃** — 이미지 · 비디오 · 오디오가 한 줄에 놓이고, 이미지 열은 9칸 고정
  폭이라 사진을 넣고 빼도 오른쪽이 흔들리지 않습니다. 헤더/테일 상자는 내용에 맞춰 늘어나고,
  `LOCAL ENHANCE` 블록은 접을 수 있습니다(접으면 그 높이가 전부 에디터로 갑니다).
- Prompt Edit은 노드 모드에 맞는 인핸스 모드로 열립니다 — Text only는 `Text → Brief`,
  Reference / First-Last는 `Image → Brief`.
- 갤러리 이미지 피커에 **INPUT 폴더 탭** 추가(기본 선택). Prompt Edit 첨부 칸에도 갤러리
  선택 버튼이 붙습니다.
- **디블러가 업스케일과 독립된 단계**가 되었습니다. 각각 자기 `None`을 갖고, 업스케일 없이
  단독으로 실행됩니다. 해상도는 바뀌지 않습니다.

### 수정

- **프롬포트 세트의 Save / Delete 버튼이 눌리지 않던 문제** — ComfyUI 프론트엔드가
  `window.prompt` / `confirm`을 억제해 핸들러가 거기서 멈췄습니다. 인앱 다이얼로그
  (`web/shared/ui_ask.js`)로 교체했습니다. 파이프라인 프리셋의 Rename / Delete도 같은
  원인이었습니다.
- **프롬포트 세트 저장 시 서버가 첨부 파일 필드를 버리던 문제** — 저장 라우트가
  `promptHeader` / `promptFooter` / `prompts`만 통과시켰습니다. payload를 `v: 2`로 올렸습니다.
- Prompt Edit에서 클립을 전환할 때 헤더/테일 상자가 그 클립 기준으로 다시 읽히지 않던 문제.

### 새 라우트

- `POST /tj_shared/input_exists` — 이름 배열을 받아 input 폴더에 없는 것만 돌려줍니다.
  파일마다 요청을 던지면 로드 한 번에 수십 왕복이 됩니다.
- `GET /tj_shared/input_gallery` — input 폴더의 이미지 목록.

---

## v1.19.0 (2026-08-27)

### 갤러리: Upscale + Frame Interpolation

- **갤러리에서 바로 업스케일/프레임 보정** — 🔗 Stitch 오른쪽에 ⬆ Upscale / 🎞 Interpolate
  버튼 추가. 스티치와 같은 방식(모드 선택 → 그리드에서 클립 선택 → 바에서 실행)이며, 대상은
  단일 영상입니다.
  - Upscale은 좌측 패널과 동일한 두 방식(Upscale Model / RTX VSR) 제공, 기본값도 패널
    설정을 따릅니다.
  - Interpolation은 **RIFE Frame Interpolation**(`RIFEInterpolation`) 노드 사용 — source/
    target fps 쌍으로 지정하며 소스는 24fps 고정, 타겟만 조절합니다. 인코딩은 target fps
    기준이라 재생 길이는 그대로 유지되고 움직임만 부드러워집니다 (192f/24fps → 480f/60fps,
    오디오 유지 확인).
  - Upscale Model / RIFE는 실시간 진행률 표시. RTX는 배치 전체를 한 번에 처리하는 노드라
    진행률 이벤트가 없어 "처리 중" 표시만 나옵니다.

### 입력 폴더 임시 파일 누적 수정

- **Last Frame Chain이 아닌 모드에서도 매 클립마다 input 폴더에 체인 프레임이 복사되던
  문제 수정** — 복사 결과는 Last Frame Chain일 때만 쓰이는데 항상 복사가 실행되어, 다른
  모드에서는 아무도 읽지 않는 파일이 클립마다 하나씩 쌓였습니다(89개 확인). 이제 continuity
  모드가 Last Frame Chain일 때만 복사합니다. 그 복사에만 쓰이던 클립당 8장의 임시 프리뷰도
  같은 조건으로 껐습니다.
- **last_frame 출력 슬롯이 남기는 PNG가 무한히 누적되던 문제 수정** — 새 프레임이 기록될
  때 직전 파일을 삭제해 항상 최신 1개만 남도록 변경(400개 → 1개로 확인). 삭제 대상은 이
  노드가 쓴 `.png`, `frames` 서브폴더, output 루트 내부로 좁게 제한.
- **갤러리 업스케일/보정이 남기는 input 폴더 복사본 자동 정리** — 처리 후(성공/실패 무관)
  복사본을 삭제하는 `discard_input` 라우트 추가. 프리픽스가 일치하지 않는 파일(사용자
  자산)은 거부.

### Gallery: Upscale + Frame Interpolation

- **Upscale and frame-interpolate a clip straight from the gallery** — `⬆ Upscale` /
  `🎞 Interpolate` buttons next to `🔗 Stitch`, working the same way (arm a mode, pick a
  clip from the grid, run from a bar), targeting a single video.
  - Upscale offers the same two methods as the left panel (Upscale Model / RTX VSR),
    defaulting to the panel's own settings.
  - Interpolation uses the **RIFE Frame Interpolation** (`RIFEInterpolation`) node — an
    explicit source/target fps pair, source fixed at 24, target adjustable. Encoding uses
    the target rate, so the clip keeps its running time and just moves more smoothly
    (verified 192 frames/24fps in → 480/60fps out, audio intact).
  - Upscale Model and RIFE report real per-frame progress; RTX processes the whole batch
    in one node call, so it has no progress events and just shows "working."

### Input-folder accumulation fixes

- **Chain frames were copied into the input folder every clip, in every continuity
  mode** — only Last Frame Chain ever reads the result, so the rest just accumulated
  (89 files found). Now gated on the run's continuity mode; the eight temp tail previews
  that fed it are gated the same way.
- **The last-frame PNG output slot accumulated one file per clip forever** — now the
  previous file is deleted when a new one replaces it, keeping exactly one (400 → 1
  verified). Deletion is narrowly scoped to this node's own files under the output root.
- **Gallery upscale/interpolate's own input-folder copies are now cleaned up** after the
  job finishes (success or failure) via a new `discard_input` route, which refuses any
  filename that doesn't match the pack's copy prefix.

## v1.18.1 (2026-08-27)

- **좌측 패널: 설정을 바꿀 때마다 스크롤이 맨 위로 튀던 문제 수정** — 컨트롤 하나를
  건드리면 패널 전체를 다시 그리는데, 새로 그려진 스크롤 컨테이너는 맨 위에서 시작합니다.
  그래서 중간쯤에 있는 체크박스 하나를 켤 때마다 Canvas로 되돌아가 다시 스크롤해 내려와야
  했습니다. 다시 그리기 전후로 스크롤 위치를 보존하도록 수정
- **fixed the left panel jumping back to the top on every change** — each control
  re-renders the whole column, and a rebuilt scroll container starts at the top, so
  ticking one checkbox halfway down threw you back to Canvas. The scroll position is
  now carried across the rebuild

---

## v1.18.0 (2026-08-27)

### One-Take 이음매 아티팩트 완화 + 좌측 패널 정리

**측정 결과 먼저** — One-Take로 이어붙인 클립은 2번째부터 **프레임 39~42에서 색이 깨집니다.**
9클립 런에서 8개 전부 같은 자리, 같은 규모로 발생했습니다. 오버랩 39프레임이 끝나고 새로
생성된 구간이 시작되는 바로 그 지점입니다.

동일 조건(같은 시드·프롬프트, 0.2MP) A/B 대조로 원인을 좁혔습니다:

| | 프레임간 색 점프 피크 | baseline 대비 | 소요 |
|---|---|---|---|
| Spectrum + FirstBlockCache | 183.9 | 191× | 3.8분 |
| 가속기 전부 OFF | 59.4 | **50×** | 7.8분 |

**가속기를 다 꺼도 이음매는 남습니다.** 근본 원인은 `TJ_H3_LatentContinuation`이 이전 클립의
latent를 페더링 없이 하드 스플라이스하는 것이고, VAE가 그 경계를 디코드하며 몇 프레임을
망칩니다. 가속기는 이를 약 3배 증폭하는 악화 요인이지 원인이 아닙니다. (가속기가 시간을
절반으로 줄여주는 것도 함께 확인됐으니, 이 문제 때문에 끌 이유는 없습니다.)

- **갤러리 스티치에 트림 프레임 입력 필드 추가** — 기본값 43(오버랩 39 + 가드 4). 기존에는
  39프레임만 잘라내서 **깨진 39~42가 최종본에 그대로 남았습니다.** 소재에 따라 아티팩트
  길이가 조금씩 달라서 조절 가능하게 했습니다. 자동 스티치는 요청대로 39 유지 — 결과가
  이상하면 갤러리에서 다시 합치면 됩니다
- **좌측 패널 Output 제거** — 유일한 항목이던 "Free VRAM between clips"가 Settings →
  Output → Relay에 이미 있고, 그쪽은 서버 config를 왕복해 새 노드에도 승계됩니다. 한 값에
  체크박스 둘이면 어느 쪽이 이겼는지 헷갈릴 뿐이라 정리
- **Steps 위치 이동** — 스크롤 영역 맨 아래, 고정된 Seed/Generate 바로 위로

- **measured the One-Take seam artefact and shipped a mitigation**
- every continued clip breaks up in colour at frames 39-42 — exactly where the 39-frame
  carried latent ends. A matched A/B at 0.2MP (same seed and prompt, only the
  accelerators differing) peaked at 191x baseline with Spectrum + FirstBlockCache and
  still 50x with everything off, so the hard latent splice is the cause and the
  accelerators roughly treble it rather than creating it
- the Gallery stitch gained an editable trim-frames field, defaulting to 43 (the overlap
  plus four frames of guard); trimming the bare overlap left the broken frames in. Auto
  stitch keeps using 39 as requested — re-stitch by hand when it looks wrong
- removed the left panel's Output section, whose one control duplicated Settings
- Steps moved to the bottom of the scrolling column, just above Seed/Generate

---

## v1.17.1 (2026-08-26)

### 설치 스크립트 수정 + 전체 노드 업데이트 배치 + Reuse 복구

- **리눅스에서 설치가 안 되던 원인** — `install_requirements.sh`가 실행 권한 없이(100644)
  커밋되어 있어 `./install_requirements.sh` 시 Permission denied. 100755로 고치고,
  `.gitattributes`로 `*.sh`를 LF에 고정해 윈도우에서 커밋해도 CRLF가 섞이지 않게 함
  (CRLF면 리눅스에서 "bad interpreter"로 죽는데, 원인 파악이 어려운 형태의 같은 문제)
- **`.bat`이 뒤쪽 저장소를 아예 설치하지 않던 문제** — 루프 상한이 `16`으로 박혀 있었는데
  목록은 20개로 늘어나 있었음. 목록 개수에서 계산하도록 수정
- **RTX 노드 설치 실패** — `nvidia-vfx`가 NVIDIA의 `wheel-stub`을 빌드 백엔드로 선언하는데
  pip이 이를 항상 받아오지는 않고, pip의 격리 빌드 환경은 전역 빌드 도구를 물려받지도
  않음. `wheel-stub` 선설치 + 실패 시 `--no-build-isolation` 재시도로 해결
- **중복 설치** — Manager는 저장소 이름이 아니라 pyproject의 `name`으로 폴더를 만들어서,
  이미 설치된 3개 팩을 저장소 이름으로 또 clone하고 있었음(노드 이중 등록). 두 이름 모두
  대소문자 무시하고 확인(리눅스는 대소문자 구분)
- **pip 선갱신** + 기존 팩은 건너뛰지 않고 `git pull`하도록 변경 — 설치 스크립트가
  업데이트도 겸함
- **`update_all_nodes.bat` 신규** — `custom_nodes` 아래 모든 git 체크아웃을 pull.
  `--ff-only`에 사전 dirty 검사까지 해서 로컬 변경이 있는 폴더는 손대지 않고 보고만 함
  (머지·리셋·폐기 없음). 실제로 갱신된 팩만 의존성 재설치
- **Reuse / 실측 ETA 복구** — 파이프라인 축 분리 이후 `accelMode`를 계속 읽던 3곳을 수정.
  클립 메타가 죽은 값을 저장하고, Reuse가 `attnBackend`에 `"turbo"` 같은 유효하지 않은
  값을 넣고, 실측 평균은 매칭이 영영 실패해 조용히 수동값으로 폴백하고 있었음

- **installer fixes, an update-everything batch, and Reuse repair**
- the Linux installer was committed without its exec bit (Permission denied); fixed and
  pinned `*.sh` to LF via .gitattributes so a Windows commit can't reintroduce CRLF
- the .bat loop bound was hardcoded below the list length, silently skipping the last
  repos entirely
- RTX nodes now install: wheel-stub up front plus a `--no-build-isolation` retry
- three packs were being cloned a second time next to a Manager install because Manager
  names folders after the pyproject name; matched on both names, case-insensitively
- existing packs are pulled rather than skipped, so the installer doubles as an updater
- new `update_all_nodes.bat` pulls every git checkout under custom_nodes, refusing to
  touch anything with local changes and refreshing requirements only where something
  actually moved
- fixed clip Reuse and the measured ETA, which both still read the retired accelMode

---

## v1.17.0 (2026-08-26)

### MiniMax H3 — 파이프라인 축 분리 + 아코디언 UI + 신규 가속 노드

가속 옵션들이 서로 어떻게 간섭하는지 코드로 전수 감사한 뒤, **패치 계층별로 축을 나눠**
재구성했습니다. 조용히 서로를 덮어쓰던 조합이 사라지고, 못 쓰는 조합은 회색 + 사유로
표시됩니다.

- **조용한 덮어쓰기 2건 수정 (실제 낭비였음)**
  - `H3 SLA Attention`이 `optimized_attention_override`를 기존 값 확인 없이 대입해서,
    SageAttention·SolAttn과 같이 켜면 **경고 없이 하나만 동작**하던 문제
  - `MemEff Sage`가 `blocks[i].attn.forward`를 교체해 stock forward를 없애는데, override
    방식 백엔드(CK/SolAttn/SLA)는 그 stock forward를 통해서만 호출되므로 **켜둔 백엔드가
    전혀 실행되지 않던** 문제 — 이제 해당 조합은 선택 자체가 막힙니다
- **Turbo 2종 분리** — larryvrh(전용 노드, 4스텝)와 lightx2v(일반 LoRA)는 요구 어텐션이
  정반대입니다. larryvrh는 dense 전용(4스텝이라 sparse 오차를 흡수 못 함), lightx2v는
  SLA 커널에 맞춰 distill된 것이라 SLA가 없으면 속도 이득이 아예 없음 — 각각에 맞는
  어텐션만 선택 가능하도록 게이팅. Turbo LoRA 선택은 Settings가 아닌 노드 패널에서,
  변경 즉시 자동 저장
- **신규 노드 2종 배선** (Saganaki22/ComfyUI-sol-attn)
  - `MiniMaxH3FusedModulation` — AdaLN scale/shift + gated residual을 Triton으로 fuse.
    `blocks[i].forward`를 패치하지만 `adaln_proj`는 그대로 호출하므로 Turbo의 LoRA 주입도
    살아남습니다. **다른 모든 옵션과 자유 조합 가능**
  - `MiniMaxH3ScheduledSolAttentionPatch` — fused qkv의 strided view로 동작해 q/k/v 복사가
    없고, tau를 샘플링 구간에 걸쳐 램프. MemEff Sage가 앞에 있으면 fallback으로 자동 채택
- **블록 캐시 상호배제 명시** — H3 Cache(`block_loop`)와 FirstBlockCache(`double_block`)는
  기전이 달라 서로의 충돌 검사에 안 걸리지만 같은 근사를 이중으로 적용하므로 배타 처리.
  **Spectrum은 latent 축이라 캐시와 상보적** — 독립 토글로 분리해 함께 사용 가능
- **좌측 패널 아코디언화** — Turbo / 어텐션 / 블록 캐시 / Spectrum / 모델 패치 / 업스케일 /
  연속성 / 오디오 락 / Images / LoRA. 접힌 상태로도 헤더에 현재 설정 요약이 보이고, 펼침
  상태는 워크플로우에 저장됩니다. 비활성 옵션은 숨기지 않고 회색 + 사유 툴팁
- **Steps** — Turbo가 켜지면 일반 스텝 필드는 비활성화되고, Turbo 쪽 스텝이 실제로 사용됨을
  명시
- **기존 워크플로우 자동 마이그레이션** — 예전 `accelMode` 단일 값을 새 축들로 변환하므로
  저장된 워크플로우가 초기화되지 않습니다
- **버그 수정: 생성 완료 후 프리뷰가 결과 영상으로 안 바뀌던 문제** — KJ 프리뷰 인코더가
  백그라운드 스레드라 `execution_success` 이후에도 프레임이 도착하는데, 그게 이미 표시된
  결과 영상을 덮고 loop로 무한 재생되고 있었습니다(스티치 결과 포함). 최종 결과 표시 후
  프리뷰 박스를 잠그도록 수정

- **split the pipeline into one control per patch layer, with accordions**
- fixed two silent overwrites found by auditing what each node actually patches: SLA
  clobbered any other `optimized_attention_override` without a word, and MemEff Sage
  replaced the stock `attn.forward` that override-based backends rely on — so an
  enabled backend never ran. Both combinations are now blocked in the UI with a reason
- the two turbo packs pull opposite ways (larryvrh needs dense attention at 4 steps;
  lightx2v is distilled against the SLA kernel and is pointless without it), so each
  gates the attention list to what it can actually use
- wired `MiniMaxH3FusedModulation` (stacks with everything — verified it still calls
  `adaln_proj`, so turbo's LoRA injection survives) and
  `MiniMaxH3ScheduledSolAttentionPatch` (strided fused-qkv views, ramped tau)
- H3 Cache and FirstBlockCache are now mutually exclusive; Spectrum works on the latent
  axis instead and stays an independent toggle that combines with either
- left panel is now collapsible sections that summarise their settings while closed and
  remember what was open; blocked options stay visible, greyed, with the reason
- old workflows migrate automatically from the previous single `accelMode`
- fixed the preview box keeping a looping live frame instead of the finished video: KJ
  encodes previews on a background thread, so late frames landed after the result was
  already shown

---

## v1.16.2 (2026-08-26)

- **버전만 갱신(코드 변경 없음)** — Comfy Registry 자동 리뷰가 지난 버전들을 Flagged로
  걸러서 ComfyUI Manager의 "Select Version" 목록이 비어 보이던 문제 때문에, 새로
  발행되어 아직 리뷰 전인 버전을 하나 만들기 위한 갱신
- **version bump only (no code changes)** — published to get a fresh, not-yet-reviewed
  version into Comfy Registry after older ones got auto-flagged, which was emptying
  ComfyUI Manager's "Select Version" list

---

## v1.16.1 (2026-08-25)

### MiniMax H3 — Free Text Encoder VRAM 이식

- **텍스트 인코더 명시적 VRAM 언로드** — conditioning 계산이 끝난 직후, 샘플링(디퓨즈
  모델 로드) 시작 직전에 TJ_NODE의 `TJ_FreeTextEncoderVRAM`을 그래프에 끼워 넣어
  텍스트 인코더를 명시적으로 내림. ComfyUI의 스마트 메모리 관리가 항상 100% 깔끔하게
  내려주지는 않아서 샘플링 중 여유 VRAM을 갉아먹던 문제를 완화. 노드가 설치돼 있을
  때만 자동 적용(없으면 기존과 동일하게 동작)

- **ported Free Text Encoder VRAM**
- inserts TJ_NODE's `TJ_FreeTextEncoderVRAM` right after conditioning is built and
  before sampling starts, explicitly freeing the text encoder instead of relying on
  ComfyUI's own smart unload (which doesn't always fully clean up) — applies
  automatically when the node is installed, no-op otherwise

---

## v1.16.0 (2026-08-25)

### MiniMax H3 — 클립 메타데이터/완전 Reuse/실측 평균 + 새치기 큐 대응 + 버그 수정

- **클립 메타데이터 확장 + 완전 Reuse** — 클립 저장 시 소요시간(`elapsedSec`), 터보
  LoRA(이름/강도/저VRAM), 일반 LoRA 슬롯 스냅샷을 함께 기록. 갤러리 썸네일에 ⓘ
  호버 팝업(해상도/스텝/샘플러/가속모드/소요시간/LoRA/시드)추가. "↩ Reuse"가
  프롬프트뿐 아니라 해상도·프레임·스텝·샘플러·가속모드·터보/일반 LoRA·시드까지
  전부 복원(같은 시드 고정)하도록 확장
- **실측 평균 소요시간** — Settings → Output에서 저장 폴더의 과거 클립 중 현재
  설정(해상도·megapixels·frames·가속모드·LoRA 사용여부)과 일치하는 것만 걸러서
  실제 소요시간 평균을 "Avg minutes per clip"에 자동 반영, 표본 수 표시
- **다른 큐 새치기 경고** — 이 화면의 클립 외에 ComfyUI 서버 큐에 다른 작업이 있으면
  진행률 바 아래에 경고 배너 표시(4초 간격 폴링, 실행 중~Next Gen 연쇄 끝까지 유지)
- **Stop 버튼 안전장치** — `/interrupt`는 전역이라 "지금 실행 중인 것"을 무조건
  끊는데, 그게 이 노드 자신의 클립이 아닌 것 같으면(다른 세션이 새치기했을 때) 먼저
  confirm으로 물어보고 진행하도록 변경 — 실수로 남의 생성 끊는 것 방지
- **버그 수정**: 새로고침 복구 로직이 예전 형식의 leftover `_relay`를 만나면
  `.map()` 크래시가 나던 문제 수정(방어적으로 정리 후 진행). `genBtn.onclick =
  runGeneration` 직접 할당 시 클릭 Event가 `resume` 인자로 새어 들어가 정상 클릭도
  "No prompts are switched on" 에러를 내던 버그 수정(래퍼 함수로 격리)

- **added clip metadata / full Reuse / measured average + other-queue awareness + fixes**
- clip meta now also records elapsed render time, turbo LoRA config, and a snapshot of
  the regular LoRA slots; Gallery thumbnails gained an ⓘ hover popup; "↩ Reuse" now
  restores the full render config (resolution/steps/sampler/accel/both LoRA slots/seed),
  not just the prompt
- Settings → Output now auto-computes "Avg minutes per clip" from past clips matching
  the current config, showing the sample count
- a warning banner appears when something besides this screen's own clip is sitting in
  ComfyUI's server queue (polled every 4s, persists across Next Gen chaining)
- Stop now checks whether the clip actually running server-side is this node's own
  before interrupting, confirming first if it looks like someone else's job cut in line
- fixed a crash where an older-shaped leftover `_relay` (from before this version) threw
  on resume, and a bug where assigning `genBtn.onclick = runGeneration` directly let the
  click Event leak into the `resume` parameter, breaking every normal Generate click

---

## v1.15.1 (2026-08-25)

### MiniMax H3 — 절전/탭 종료 방지 + README 안내

- **백그라운드 웨이크 오디오** — 실행 중(Next Gen 연쇄 포함)에는 거의 무음에 가까운 낮은
  볼륨의 오디오를 계속 재생해 브라우저/OS가 탭을 절전 상태로 넘기지 않도록 유도(웹 버전과
  동일한 우회책). 완전히 유휴 상태가 될 때만 정지
- **탭 종료 경고** — 이 노드 자신의 릴레이(`running`) 또는 Next Gen 대기열이 돌고 있을
  때만 브라우저 네이티브 "이 페이지를 나가시겠습니까?" 경고 표시. 노드 선택 여부와
  무관하며, 다른 노드/큐에는 영향 없음
- **README** — 이미지 노드의 RUN 큐(서버가 통째로 소유, 브라우저 닫아도 계속 처리)와
  MiniMax H3의 클립 릴레이(브라우저가 매 클립마다 판단해서 재제출하는 구조라 탭이 계속
  열려 있어야 함) 구조 차이, 절전모드 영향, 새로고침 복구를 한/영으로 명시

- **added sleep/tab-close mitigations for MiniMax H3, documented in README**
- a near-silent background tone now plays for the whole run (persists across Next Gen
  chaining), nudging the browser/OS away from suspending the tab — same trick the web
  version uses; stops only once truly idle
- a native "leave site?" warning now fires only while this node's own relay or Next Gen
  queue is actually active — scoped per node instance, unaffected by selection state or
  any other node/queue
- README now explains why this differs from image nodes' RUN queue (server-owned,
  survives closing the browser) — MiniMax H3's clip relay decides and resubmits per clip
  from the browser, so the tab must stay open — plus the sleep-mode caveat and that a
  plain refresh is safe

---

## v1.15.0 (2026-08-24)

### MiniMax H3 — Next Gen 대기 큐 + 새로고침 후 릴레이 자동 복구

- **Next Gen 대기 큐** — 활성 프롬프트가 1개일 때만 "⏭ Next Gen" 버튼이 나타나며, 누를
  때마다 지금 화면 전체를 스냅샷해 큐에 추가(ComfyUI 자체 큐처럼 FIFO). 📋 버튼으로 대기
  목록 팝업을 열어 각 항목을 확인하고 개별 취소 가능. 현재 실행이 정상 종료되면 큐 맨
  앞 항목이 패널을 이어받아 자동 시작, Stop 시 큐 전체 비움
- **새로고침 후 멀티클립 릴레이 자동 복구** — 클립이 끝날 때마다 진행 상황(위치, 활성
  프롬프트 인덱스, One-Take 체크포인트 체인, 완료된 클립 목록)을 노드 state에 저장.
  정상종료/Stop/에러 시에는 삭제되지만 순수 새로고침에는 그대로 남아, 노드 로드 시 이를
  감지해 서버에서 실행 중인 클립이 있으면 `waitForHistory`로 재연결(새 제출 없이 결과만
  기다림), 없으면 그 위치부터 새로 빌드해 나머지 클립과 One-Take 스티치까지 자동 완주

- **added a Next Gen queue and automatic relay resume after a refresh**
- "⏭ Next Gen" (shown only with exactly one active prompt) snapshots the whole panel and
  appends it to a FIFO queue, same idea as ComfyUI's own queue; a 📋 button opens a popup
  listing every queued entry with per-item cancel. The queue's front entry takes over and
  auto-starts once the current run finishes cleanly; Stop clears the whole queue
- a reload no longer loses a multi-clip relay run — progress (position, active-prompt
  indices, One-Take checkpoint chain, finished clips) is saved to node state after every
  clip and cleared only on a clean finish/Stop/error. On load, if it's still there, the
  node reconnects to whatever clip is still executing server-side (via the new
  `waitForHistory`, polling `/history` instead of resubmitting) or rebuilds that one clip
  fresh, then continues the rest of the run — including the eventual One-Take stitch —
  automatically

---

## v1.14.0 (2026-08-24)

### MiniMax H3 — 웹 버전 기능 이식 + 가속/캐시/어텐션 옵션 확장

- **갤러리에서 이미지 업로드** — 이미지 업로드 카드(첫/마지막 프레임, Reference)에 5개 이미지
  툴의 갤러리에서 바로 고를 수 있는 🖼 버튼 추가
- **Audio Lock 재생/트림 컨트롤** — 파일 업로드 시 재생 컨트롤러, start/end 트림 필드, 트림
  구간만 재생 + 재생 시간 자동 갱신 추가 (웹 버전과 동일)
- **One-Take: "Replace with Audio Lock source"** — 원테이크 자동 스티치, 갤러리 스티치 양쪽에
  생성된 오디오 대신 Audio Lock 소스 파일을 트림해서 쓰는 옵션 추가
- **클립 길이 커스텀(초 단위)** 옵션 추가
- **Turbo LoRA를 Reference 모드에서도 사용 가능**하게 복원, 표기를 "Turbo LoRA(larryvrh)"로 변경
- **H3 FirstBlockCache (step reuse) 추가** — 기존 H3 Cache와 상호배타적으로 선택(Spectrum과는
  호환)
- **CK-Attention / SageAttention 그룹 선택** — `ModelAttentionBackend`(comfy kitchen attention)
  를 SageAttention(KJ) 그룹과 양자택일로 추가, Mem-eff SageAttention 패치는 독립 체크박스로 복원
- **H3 SLA Attention 추가** — Settings → Models에서 활성화 + 세부 옵션(sparsity, block size 등)
  조절, 노드 좌측 패널에 노드 자체 bypass 토글과 연결된 빠른 온/오프 체크박스 추가
- **첫/마지막 프레임, Reference 이미지 카드별 MP(메가픽셀) 지정** — 지정한 크기로 리사이즈해서
  큐로 전송 (`ImageScaleToTotalPixels`)
- **LOCAL ENHANCE(Image → Brief)의 Ollama 비전 경로도 1MP로 고정** — native 경로는 이미 1MP
  고정이었으나 Ollama 경로는 리사이즈 없이 원본을 보내고 있던 것을 통일
- 새 의존 노드 3종 설치 스크립트/문서 추가: `ComfyUI-MiniMaxH3-FirstBlockCache`,
  `ComfyUI-PlagueKind-Nodes`(H3 SLA Attention). `ModelAttentionBackend`는 ComfyUI 코어 노드

- **ported 5 web-version features + expanded accel/cache/attention options**
- gallery image picker on upload cards; Audio Lock playback/trim controls with live scrubbing;
  One-Take & gallery-stitch "Replace with Audio Lock source"; custom clip length in seconds
- Turbo LoRA restored for Reference mode, relabeled "Turbo LoRA(larryvrh)"
- added H3 FirstBlockCache (step reuse), mutually exclusive with H3 Cache, compatible with
  Spectrum
- added CK-Attention (`ModelAttentionBackend`) as an alternative to the SageAttention group;
  H3 mem-efficient SageAttention patch is an independent checkbox again
- added H3 SLA Attention: Settings → Models toggle + tuning, left-panel checkbox wired to the
  node's own bypass
- per-card megapixel override for first/last/reference images, resized via
  `ImageScaleToTotalPixels` before being queued
- LOCAL ENHANCE (Image → Brief)'s Ollama vision path is now capped at 1MP too, matching the
  native path
- added install entries for `ComfyUI-MiniMaxH3-FirstBlockCache` and `ComfyUI-PlagueKind-Nodes`
  (H3 SLA Attention); `ModelAttentionBackend` is a ComfyUI core node, no install needed

---

## v1.13.3 (2026-08-20)

- **MiniMax H3 — Spectrum과 H3 Cache 상호배제** — Turbo LoRA와 동일하게, Accel을 Spectrum으로
  선택하면 H3 Cache(step reuse) 체크박스가 강제로 꺼지고 비활성화됨(둘 다 자체 스텝 스케줄
  가속기라 같이 쓰면 충돌)
- **MiniMax H3 — Spectrum/H3 Cache mutual exclusion** — same treatment as Turbo LoRA: selecting
  Spectrum as the accelerator now forces H3 Cache (step reuse) off and disables the checkbox
  (both are their own step-schedule accelerators and conflict when stacked)

---

## v1.13.2 (2026-08-20)

### MiniMax H3 — Settings 전 항목 Save All 반영

- **라이브 프리뷰에 tiny/approx VAE 선택 추가** — `ModelPreviewOverrideKJ`의 `tiny_vae` 배선은
  이미 있었지만 고를 UI가 없어서 항상 비어 있었음. Settings → Preview에 `models/vae_approx/`
  스캔한 드롭다운 추가
- **Save All이 실제로 "전 항목"을 저장하게 수정** — Preview 5개 필드는 물론, Sampling/
  SageAttention/H3 Cache/Ollama/Output 탭의 값 26개가 지금까지 Save All 대상에서 빠져
  있었음(모델 선택 몇 개만 저장되고 나머지는 새 노드에 안 물려받아짐). 41개 필드 전부
  `/minimax_h3_one/config` GET/POST 왕복에 포함되도록 수정
- **fully wired Save All across all Settings fields** — added a Preview VAE (tiny/approx)
  picker for the live preview (the graph-side wiring already existed, just had no UI), and
  fixed Save All to actually persist every Settings field — 26 fields across
  Sampling/SageAttention/H3 Cache/Ollama/Output were silently excluded before, so new nodes
  never inherited them. All 41 fields now round-trip through `/minimax_h3_one/config`

---

## v1.13.1 (2026-08-20)

### MiniMax H3 — 버그 수정 3건

- **One-Take 생성 실패 수정** — TJ_NODE의 `TJ_H3_LoadLatentCheckpoint`에 나중에 필수(required)
  로 추가된 `strict` 입력을 이 저장소의 그래프 빌더가 채우지 않아, One-Take 두 번째 클립부터
  프롬프트 검증에서 튕기던 문제. `strict: true`를 명시해서 수정
- **fixed One-Take generation failure** — TJ_NODE's `TJ_H3_LoadLatentCheckpoint` later gained a
  required `strict` input that this repo's graph builder never supplied, failing prompt
  validation from the second One-Take clip onward. Fixed by explicitly sending `strict: true`
- **One-Take + Auto-stitch 예상 총 길이 표시 수정** — 원테이크로 스티치하면 클립마다 겹침
  구간(39프레임/1.625초)이 트림되는데, 좌측 패널의 "총 길이" 표시는 이걸 반영 안 하고 단순
  합산만 보여주고 있었음. 이제 One-Take + Auto-stitch가 켜져 있으면 "single: Xs / onetake: Ys
  total"로 (실제 스티치와 동일한 공식으로 계산한) 트림된 총 길이를 같이 보여줌
- **fixed the estimated total-length display for One-Take + Auto-stitch** — the left-panel total
  was a naive sum that ignored the per-clip overlap trim the actual stitch applies. Now shows
  "single: Xs / onetake: Ys total" using the exact same trim formula as the real stitch, when
  One-Take + Auto-stitch is active
- **프리뷰의 ⛶ 전체화면 버튼 수정** — 이미지 전용 오버레이 헬퍼(`<img>` 태그)를 영상 URL에
  그대로 써서 아무것도 안 보이던 버그. 영상용 오버레이(`openVideoFullscreen`, 재생 위치 유지,
  ✕/ESC/바깥클릭으로 닫힘)를 새로 만들어 교체 — 더블클릭의 브라우저 네이티브 전체화면과는
  다른 동작(주소창 유지)이 되도록 설계
- **fixed the preview's ⛶ fullscreen button** — it rendered the video URL inside an image-only
  overlay helper (`<img>` tag), showing nothing. Replaced with a new video-specific overlay
  (`openVideoFullscreen`, resumes at current playback position, closes via ✕/ESC/outside-click)
  — deliberately different from double-click's native browser fullscreen (keeps tab chrome
  visible)

---

## v1.13.0 (2026-08-18)

### 프롬프트 템플릿 저장소 독립화 / prompt-template storage decoupled

사용자 지정("MY TEMPLATES") 프롬프트 템플릿을 더 이상 Klein의 `config_klein.json`에
얹혀사는 방식이 아니라, 독립된 공용 저장소 두 개로 분리했다. 프롬프트가 자연어냐
태그/가중치 방식이냐로 나눔:

- **nl 풀** (자연어) — Klein · Krea2 · Z-Image · Qwen2511 · Anima 5개 도구가 공유
- **tag 풀** (태그/가중치) — SDXL 전용, nl 풀과 완전히 분리

신규 백엔드 라우트 `/shared/prompt_templates?pool=nl|tag` (`templates_prompt_nl.json` /
`templates_prompt_tag.json`), 신규 프론트엔드 `web/shared/api_templates.js`. 최초 기동 시
nl 풀은 기존에 흩어져 있던 Klein·Z-Image의 저장 템플릿을 이름+내용 기준 중복 제거해
자동 병합 — 기존 사용자 템플릿 유실 없음. Z-Image 전용 사본이던
`web/zimage/ui_prompt_templates.js`는 삭제, 이제 Klein과 같은 파일을 pool="nl"로 공유.

The custom "MY TEMPLATES" pool no longer piggybacks on Klein's own config file — it's
now two independent shared stores split by prompt style: an **nl** pool (natural
language: Klein, Krea2, Z-Image, Qwen2511, Anima) and a **tag** pool (tag/weight
syntax: SDXL only). New backend route `/shared/prompt_templates?pool=nl|tag`, new
frontend `web/shared/api_templates.js`. On first boot the nl pool auto-seeds from the
union of Klein's and Z-Image's previously-separate saved templates (deduped by
name+prompt) so nothing is lost. Z-Image's old standalone copy of the template-editor
module is removed — it now shares Klein's file with pool="nl".

---

## v1.12.1 (2026-08-18)

- 패키지 설명(`pyproject.toml`)에 Anima 반영 / package description now includes Anima
- GitHub 저장소 About 설명 업데이트 / updated GitHub repo About description

---

## v1.12.0 (2026-08-18)

### Anima ONE STUDIO (신규 노드 / new node)

ComfyUI 네이티브 애니메이션풍 이미지 모델 **Anima**를 위한 7번째 ONE STUDIO 노드.

- 모드 4종: T2I · Inpainting · Any Control to Image · Depth Control to Image
- Turbo LoRA 토글 — Base 1.0 체크포인트에 터보 LoRA를 얹고 30→8 steps / CFG 4→1로 자동 전환
  (공식 ComfyUI Anima 템플릿의 `ComfySwitchNode` 동작을 그대로 재현)
- T2I는 Preview3-base 체크포인트로도 전환 가능
- Inpainting / Any Control은 별도 마스크 파일 업로드 대신 **인라인 마스크 페인터**(브러시·
  지우개·줌/팬·반전) 사용 — Z-Image의 INPAINT 모드와 동일한 컴포넌트
- Depth Control은 소스 이미지에서 DepthAnythingV2로 뎁스맵 자동 추출
- Settings / Gallery(Send to 포함) / 프롬프트 템플릿 / LLM 프롬프트 강화 패널 전부 다른
  ONE STUDIO 노드와 동일한 구조로 제공
- LLM 강화 패널의 Model Format에 **"Anima (anime illustration prose)"** 프리셋 추가
  (ComfyUI-TJ_NODE 쪽 `model_formats.json`)
- 모델/LoRA 요구사항 상세는 `SPEC_ANIMA_ONE_STUDIO.md` 참고

### 마스크 에디터 — 공용 모듈로 통합 + 버그 수정

Z-Image INPAINT 모드의 인라인 마스크 에디터(브러시/지우개/줌/팬 + "크게 편집" 팝업)를
`web/shared/mask_paint.js`로 추출해 Anima를 포함한 모든 노드가 같은 구현을 공유하도록 변경.

- **버그 수정**: 저장된 마스크를 다시 불러올 때 B&W PNG → 알파 변환 루프가
  `imgData.data[3] = imgData.data[i]`로 되어 있어 항상 0번 픽셀의 알파만 갱신하고 있었음
  (`data[i + 3]`이어야 함). 저장된 마스크는 전체가 불투명이라, 이 버그로 인해 이미지를
  다시 불러오면 화면 전체가 마스크로 덮여 보이는 문제가 있었음 — Klein / Qwen2511 / SDXL /
  공용 모듈(Z-Image·Anima) 총 4곳에서 동일하게 수정
- **브러시 커서**: OS 십자 커서 대신 실제 브러시 반경 크기의 원을 캔버스에 직접 그려서
  칠해질 영역이 정확히 보이게 함(줌 배율에 맞춰 크기도 같이 변함), 지우개는 점선으로 구분
- **Invert 버튼** 추가 — 칠한 영역과 비워둔 영역을 반전(신규 요청 기능)

---

## v1.11.0 (2026-08-17)

### MiniMax H3 — One-Take (latent continuation)

새 Continuity 옵션이자 기본값. 클립의 샘플링된 latent 꼬리를 다음 클립의 머리에 그대로 이어붙여
VAE 왕복 없이, 원래 모드(Reference 포함)를 유지한 채 연속성을 만듭니다.

- ComfyUI-TJ_NODE에 신규 노드 3개: `TJ_H3_LatentContinuation`(latent 이어붙이기 + mask 생성),
  `TJ_H3_SaveLatentCheckpoint` / `TJ_H3_LoadLatentCheckpoint`(릴레이가 클립마다 큐를 새로
  제출하는 구조라, latent를 디스크 체크포인트로 이어붙임)
- Continuity 메뉴 순서: None → **One-Take (latent)**(기본값) → Reference → Last Frame Chain
- 겹침은 39프레임(1.625초)으로 고정 — latent에 실제로 구운 값과 어긋나면 잘못 스티치되므로
  사용자가 조절할 수 없게 함
- 실행 완료 시 자동으로 겹침을 잘라내고 하나로 합쳐 갤러리에 등록(끌 수 있음). 개별 클립·
  체크포인트는 재개용으로 그대로 남음
- 갤러리 🔗 스티치에도 겹침 트림 옵션 추가(One-Take 클립이면 자동 체크)
- 실기기 GPU 검증: 2·3·4클립 체인을 FL2VA·REF2VA 양쪽에서 실행, 저장된 latent 체크포인트를
  직접 대조해 겹침 구간이 float32 오차 수준(≤4.77e-7)으로 보존됨을 확인. 생성 구간(겹침 밖)은
  실제로 다름을 확인해 마스크가 보존/생성 구간을 정확히 구분함을 검증
- 상세 알고리즘·소스 근거: `SPEC_MINIMAX_H3_ONE_TAKE_NODE.md`

### MiniMax H3 — 프롬프트 워크벤치

- 프롬프트별 켜기/끄기 체크박스 — 끈 프롬프트는 건너뛰되 시드·파일명·오디오락 구간은 원래
  번호를 그대로 유지(1~10 끄고 11~ 켜서 중단한 지점부터 재개)
- 클립별 첫 프레임 오버라이드(업로드 시 그 클립만 FL2VA로 전환)
- 초기화 버튼(화면 중앙 팝업 확인)
- 이름 붙여 서버에 저장하는 프롬프트 세트(불러오기/저장/삭제)

### MiniMax H3 — 갤러리

- 실제 첫 프레임 썸네일로 교체 — 카드마다 `<video>`를 띄우던 이전 방식은 클립이 100개 넘어가면
  탭이 크래시했음. 서버에서 ffmpeg로 첫 프레임을 추출해 캐시하는 `<img>`로 교체, 몇 개든 안정적
- 카드마다 클립 길이 표시(스티치 결과는 실제 합산 길이)
- 카드마다 ✕ 삭제 버튼 — 화면 중앙 팝업 확인(Enter=삭제, Esc=취소)
- 정사각형 롱엣지핏 카드로 통일, 마우스 오버 미리보기가 Reuse/Copy 버튼을 가리던 문제 수정

### MiniMax H3 — 기타

- Image → Brief에 네이티브 비전 경로 추가 — Ollama 외에 ComfyUI 자체 CLIP(`TextGenerate`)으로
  이미지 전체를 한 번에 배치 분석 가능(실측: 진짜 멀티이미지 인식, Ollama는 한 장만 봄)
- Turbo 켜면 H3 Cache 자동으로 꺼짐(체크박스 비활성화) — 4스텝 스케줄에서는 캐시가 무의미하면서
  결과만 왜곡시킴
- Canvas Aspect에 5:4 · 2:3 · 3:2 추가, Portrait → Square → Landscape 순으로 비율 정렬
- 프리뷰 영상이 숨겨진 뒤에도 백그라운드에서 계속 재생되던 버그 3곳 수정

## v1.10.0 (2026-08-14)

### 전체 노드 — 워크플로우에 설정 저장

지금까지 6개 원노드 모두 UI가 `serialize:false` DOM 위젯이고 설정은 노드 종류별 localStorage 키 하나에만
있었습니다. 그래서 **워크플로우를 저장해도 설정이 하나도 담기지 않았습니다.** 같은 브라우저에서 열면
유지되는 것처럼 보였을 뿐입니다.

- 숨은 직렬화 위젯에 상태를 담아 **워크플로우와 함께 저장**. 다른 PC에서 열거나 파일을 남에게 넘겨도 그대로 재현됩니다
- 한 그래프에 같은 노드를 여러 개 둬도 **각자 값을 유지**합니다 (이전엔 나중에 저장한 노드가 앞 노드를 덮어썼습니다)
- 새로 꺼낸 노드는 **마지막에 쓰던 설정을 그대로 상속**합니다 (기존 편의 유지)
- 워크플로우를 여는 것만으로는 브라우저 기본값이 바뀌지 않습니다 — 남의 워크플로우를 열었다고 내 설정이 덮이면 안 되니까요
- 공통 모듈: `web/shared/node_state.js`

### MiniMax H3 — 연속성이 실제로 이어지도록

- **Last Frame Chain이 Reference 모드에서 아무 일도 하지 않았습니다.** 이어붙이기는 t2v로 시작한 실행에서만
  적용됐고, Reference는 first frame 입력이 없는 Ref2VA로 계속 렌더돼 넘겨받은 프레임이 버려졌습니다.
  실측: 클립 경계 차이 **76.12** vs 무관한 프레임 대조군 75.54 — 연속성이 전혀 없었습니다
- 이제 **이어지는 클립은 어떤 모드로 시작했든 FL2VA로 렌더**되고 이전 클립의 마지막 프레임이 진짜 first frame이
  됩니다. 같은 조건 실측: 경계 **3.48** vs 대조군 45.43
- **샷 분리가 일관성을 깨뜨리던 문제**: 분할이 스타일 머리말을 1번 클립에, 사운드 꼬리말을 마지막 클립에만
  붙여서 중간 클립들이 공통 정보 없이 생성됐습니다. 이제 공통 영역으로 올려 **모든 클립이 함께 받습니다**
- Continuity 의미 정리 — **Reference**(Reference 모드 전용): 모든 클립이 같은 레퍼런스 사용 · **None**: 클립 간
  전달 없음, 단 해당 모드의 모델은 유지
- 클립 끝이 검게 페이드아웃해도 다음 클립이 검은 화면에서 시작하지 않도록, 끝 8프레임 중 **그림이 남은 최신
  프레임**을 골라 넘깁니다

### MiniMax H3 — 설정 누락 차단 · VRAM · 갤러리

- **UNET이 지정되지 않은 모드는 진입 불가.** 상단에 무엇이 빠졌는지 경고가 뜨고(클릭 시 Settings 열림),
  해당 모델이 필요한 연속성 옵션도 비활성화됩니다. 실행 도중 검증 오류로 죽는 대신 미리 막습니다
- **실행이 끝나면 VRAM을 해제**합니다. 이전엔 클립 사이에서만, 그것도 옵션이 켜졌을 때만 해제해서 마지막 클립
  이후 카드를 계속 물고 있었습니다 (실측 15.5GB → 1.8GB)
- **갤러리에 프롬프트 저장**: 클립마다 렌더에 쓰인 프롬프트가 함께 저장되고, 카드에서 `↩ Reuse`(에디터로 복원)
  `⧉ Copy` 가능. 이전엔 첫 클립 파일명으로 노드 상태를 통째로 덤프해서 갤러리가 읽지 못했습니다
- 갤러리 영상이 **꺼진 뒤에도 계속 재생되던 문제** 수정 (DOM에서 분리된 `<video>`는 계속 재생됩니다)
- 생성된 영상 **자동 재생 제거** — 사용자가 재생 버튼을 누릅니다
- 스티치 On/Off를 왼쪽 패널에서 선택

### MiniMax H3 — LoRA 패널 (이미지 노드들과 동등하게)

- LoRA **검색**, **ON/OFF 토글**, **트리거 워드** 입력(파일 선택 시 safetensors 헤더에서 자동 입력),
  **목록 갱신**(⟳) 추가 — 전부 빠져 있었습니다
- 끈 LoRA는 가중치와 트리거 워드가 **둘 다** 실행에서 빠집니다

### MiniMax H3 — 프롬프트당 클립 반복(×N) 제거

같은 텍스트로 N개 클립을 큐에 넣을 뿐이라 같은 장면을 시드만 바꿔 반복 연기하게 만들었고, 긴 설명을 클립에
나눠 담지도 못했습니다. **프롬프트 1개 = 클립 1개**로 단순화했습니다. 길이를 늘리려면 프롬프트를 추가하거나
브리프를 샷으로 분리하면 됩니다.

### 전체 — 모델 경로 툴팁

긴 폴더 경로가 필드에서 잘려 어떤 파일인지 구분이 안 되던 문제. 마우스를 올리면 **전체 경로**가 뜹니다
(닫힌 상태와 펼친 목록의 각 항목 모두). 공유 `loraSelect`와 MiniMax Settings에 적용.

### 의존성

- `install_requirements.bat` / `.sh` 에 **ComfyUI-VideoHelperSuite**(Reference 모드 레퍼런스 비디오)와
  **ComfyUI-Spectrum-MiniMax-H3**(Spectrum 가속) 추가 — 코드가 쓰고 있었는데 설치 목록에 빠져 있었습니다
- `requirements.txt` 에 `imageio-ffmpeg` 추가 — 클립 합본에 ffmpeg가 필요하며, PATH에 없을 때를 대비합니다

---

## v1.9.4 (2026-08-13)

### 기본값 변경 · Reference 모드 정정

- **가속 기본값을 SolAttn**으로 변경 (3개 모드 모두). Turbo는 fl2v 전용이라 Reference에서 선택 불가이므로,
  어느 모드에서도 안전한 값을 기본으로 둡니다
- **샘플러 기본값을 `res_multistep`** 으로 변경
- 모드를 바꿔서 현재 가속이 그 모드에 없으면 **SolAttn으로 대체**(이전엔 None)
- 저장된 상태가 그 모드에 없는 가속을 갖고 있으면 **렌더 시점에 정규화** — 예전에는 Reference로 열었을 때
  드롭다운은 다른 값을 보여주는데 내부 상태는 turbo로 남아 있었습니다

> **정정**: v1.9.3에서 "Reference 모드가 현재 빌드에서 동작하지 않는다"고 적은 것은 **제 테스트 오류**였습니다.
> Reference에 fl2v turbo LoRA를 걸고 4스텝으로 돌린 것이 원인이었습니다. 실사용 설정
> (SolAttn / Spectrum / 없음 + 기본 20스텝)에서는 정상 동작하며, 관련 경고 배너와 문구는 제거했습니다.

---

## v1.9.3 (2026-08-13)

### MiniMax H3 — 실사용 검증에서 발견된 버그 수정

0.2MP로 전 구간을 실제 생성해 검증하며 실제 크래시 2건을 잡았습니다.

**Turbo LoRA는 베이스 모델 전용 — Reference에서 크래시**
- `fl2v` turbo LoRA를 **Ref2VA** 모델에 적용하면 turbo 팩 내부에서 예외가 납니다(adaln 세그먼트 3 vs 2)
- 존재하는 turbo LoRA가 전부 `fl2v`용이므로 **Reference 모드에서는 Turbo 옵션 자체를 노출하지 않습니다**
  (가속 드롭다운에 SolAttn / Spectrum / None만 표시). Turbo가 선택된 상태로 Reference로 바꾸면 자동으로 None
- Turbo LoRA 설정은 슬롯 하나(Text only / First-Last)로 정리

**무음 비디오 + 사운드트랙 요청 = 크래시**
- 오디오 트랙이 없는 영상에서 `VHS_LoadVideo`의 AUDIO를 요구하면 프롬프트 전체가 실패
- `media_info` 백엔드 라우트 추가 (길이 · 오디오 유무 · fps) → UI가 **무음 파일이면 사운드트랙 체크박스를 자동 해제·비활성화**하고, in/out을 **실제 길이로 클램프**

**오류 메시지 개선**
- 알려진 실패(코어 레퍼런스 경로, turbo LoRA 불일치, 무음 비디오)를 원시 텐서 오류 대신 **원인과 해결책 문장**으로 표시

> **Reference 모드 관련 정정**: 앞선 커밋에서 "Reference 모드가 동작하지 않는다"고 적었으나 이는
> **잘못된 판단**이었습니다. 초기 테스트에서 Reference에 fl2v turbo LoRA를 걸고 4스텝으로 돌린 것이
> 원인이었고, 실사용에서는 SolAttn / Spectrum / 없음 + 기본 20스텝으로 정상 동작합니다.
> 해당 경고 문구와 UI 배너는 제거했습니다.

### 라이브 검증
- **릴레이 전 구간**: 1프롬프트 ×2 → 2클립(각 5.17s) → 합본 10.37s, h264+AAC
- **마지막 프레임 체이닝**: 클립1 끝 프레임 vs 클립2 첫 프레임 픽셀 차 **4.22** (무관한 프레임끼리는 17.17) — 실제로 이어짐
- **Spectrum 가속** 생성 성공, **갤러리** 9개 영상 목록·합본 ★ 표시 확인
- **Ollama 인핸스** 텍스트/비전 모드 실제 호출 성공, 검토 팝업이 헤더/샷/사운드로 정확히 분리

---

## v1.9.2 (2026-08-13)

### MiniMax H3 — 길이 모델 재설계 · 갤러리 · 프롬프트 워크플로우

**"총 길이"는 입력이 아니라 결과입니다**
- `TOTAL SECONDS` 입력 필드 제거. 클립은 **프롬프트가 결정**합니다 — 프롬프트 1개 = 클립 1개
- 각 프롬프트에 **×N (클립 수)** 를 둬서, 한 설명이 여러 클립에 걸쳐 이어지게 할 수 있습니다.
  프롬프트1 ×2 + 프롬프트2 ×2 = **4클립 = 32초** (요청하신 케이스)
- 총 길이는 클립 길이·프롬프트 구성이 바뀌면 **즉시 갱신되는 큰 숫자 표시**로 바뀜
- 프롬프트 목록에 각 프롬프트가 담당하는 클립 범위(`C1-C2`)를 표시

> 왜 ×N인가: 하나의 프롬프트로 시간만 늘리면 모델은 같은 내용을 한 번 더 만들 뿐입니다.
> ×N은 **마지막 프레임 체이닝으로 이어지는** 클립을 만들어, 같은 설명이 계속 진행되도록 합니다.

**갤러리 + 전체화면 플레이어**
- 상단 📂 버튼이 400 에러를 내던 문제 수정 → **🖼 갤러리**로 교체
- 출력 폴더의 클립·합본 영상을 카드로 표시(호버 시 미리보기 재생, 합본은 ★ 표시)
- **더블클릭 → 전체화면 재생**: `space` 재생/일시정지 · `← →` ±5초(Shift ±1초) ·
  `[` `]` 이전/다음 영상 · `f` 브라우저 전체화면 · `Esc` 닫기
- 폴더 열기는 전용 백엔드 라우트로 처리

**프롬프트 워크플로우**
- **🧩 Common** 버튼 추가 (Prompt Edit 왼쪽) — 공통 헤더 / 사운드·음악 꼬리를 넓은 화면에서 편집.
  Prompt Edit와 같은 상태를 공유해 서로 자동 반영
- **LLM 결과를 바로 넣지 않고 검토 팝업**으로 보여줍니다 — 공통 헤더 / 클립별 샷 / 사운드 꼬리로
  **미리 분리된 상태**로 확인하고 `✓ Apply` / `↻ Enhance again` / `✕ Discard` 선택
- 메인 노드 프롬프트 영역 높이 2배

**기타**
- 노드 색상을 팩 공통 보라색(`#7612DA`)으로 통일 (민트색 오용 수정)

---

## v1.9.1 (2026-08-13)

### MiniMax H3 ONE STUDIO — UI 개선

- **라이브 프리뷰 크기 수정** — 프레임이 원본 latent 크기 그대로 작게 표시되던 문제. `width/height:100%` + `object-fit:contain`으로 바꿔 **롱엣지 기준으로 프리뷰 박스를 채우도록** 수정
- **📝 Prompt Edit 팝업 추가** (Split into clips 왼쪽 버튼) — 클립 목록 + 전체 높이 편집기.
  **Ollama 프롬프트 인핸스** 내장: TJ_NODE의 "Minimax H3 (Video)" 시스템 프롬프트를 자동 로드하고,
  **Text → Brief** / **Image → Brief**(비전 모델) 두 모드 지원. 결과를 현재 클립에만 넣거나 전체 클립으로 자동 분할 가능.
  실행 중인 클립 수·길이를 프롬프트에 함께 넘겨 브리프가 실제 렌더 구성에 맞게 나옴
- **Spectrum Apply MiniMax H3** 가속 옵션 추가 (Turbo LoRA / SolAttn / **Spectrum** / None)
- **가속 설정을 사이드 패널로 이동** — 가속 방식을 고르면 해당 파라미터가 드롭다운 바로 아래 표시되어,
  방식을 바꿀 때마다 설정 창을 오갈 필요가 없음
- **샘플링 스텝 / 터보 스텝도 사이드 패널로 이동** (현재 사용 중인 쪽을 ● 로 표시)
- **프롬프트 구조 분리 — 공통부 / 클립별 샷** (큐 제출 시점에 조립)
  - 브리프의 **상단 스타일 서문**과 **하단 `Ambient sound:` / `Music:`** 은 모든 클립에 공통이라
    별도 필드로 분리해 보관하고, 생성할 때 `헤더 + 해당 클립 샷 + 꼬리 + 접미사`로 조립합니다.
    이전에는 샷 단위로 자르면서 공통부가 유실됐습니다
  - **분리 지점을 사용자가 선택** — `✂ Split into clips…` 가 대화상자를 열어 파싱된 샷을 나열하고,
    샷 사이의 `✂ 클립 경계 / · · · join · · ·` 토글로 원하는 곳에서만 자릅니다.
    (8초에 샷 1~3개가 들어가므로 "무조건 1샷=1클립"은 대부분 틀립니다.
    6샷을 2클립으로 → 3/4 지점만 자르면 됨). `↔ Even` / `1 shot / clip` / `All in one` 프리셋 제공
  - **↶ Undo 추가** (최대 20단계) — 분리·인핸스처럼 전체 프롬프트를 덮어쓰는 동작을 되돌릴 수 있습니다
  - Ollama 인핸스(전체 클립 대상)도 같은 방식으로 공통부를 보존하고 계획된 클립 수에 맞춰 묶습니다
  - `👁 Preview sent text` 로 해당 클립이 실제로 보낼 전체 텍스트 길이를 확인 가능
- **레퍼런스 비디오 3개 · 오디오 3개 추가** (REF2VA는 이미지 9 + 비디오 3 + 오디오 3을 받습니다)
  - 비디오는 `VHS_LoadVideo`로 **24fps 고정 + 인/아웃 클리핑**(`skip_first_frames`/`frame_load_cap`)을 한 번에 처리하고,
    같은 클립의 **사운드트랙도 함께** 넘길지 체크박스로 선택 (`ref_video_audio_N`은 같은 번호의 비디오와 짝)
  - 오디오는 `LoadAudio` → `TrimAudioDuration(start_index/duration)`으로 구간 지정
  - 사이드 패널이 길어지지 않도록 **레퍼런스 타입 체크박스 드롭다운** 추가 — Images/Videos/Audios 중 체크한 것만 표시
  - 파일 목록은 로더 노드의 COMBO 옵션에서 직접 읽어와 검증과 항상 일치하며, 업로드 버튼도 제공
  - `VHS_LoadVideo` 미설치 시 비디오 레퍼런스만 건너뛰고, `TrimAudioDuration` 미설치 시 오디오를 통째로 사용

### 안정성
- 노드 가용성 판별을 **프론트엔드 LiteGraph 레지스트리 우선**으로 변경 — 팩 업데이트 후 ComfyUI를 아직
  재시작하지 않았어도 새 노드(Spectrum 등)를 올바르게 인식
- Ollama 비전 요청 시 이미지를 **백엔드에서 RGB JPEG로 정규화**(롱엣지 1280 제한) — 일부 PNG에서
  Ollama가 `Failed to load image` 로 거부하던 문제 해결
- 새 백엔드 라우트가 아직 로드되지 않았으면(재시작 전) UI가 "restart ComfyUI" 로 정확히 안내

> ⚠️ Ollama 인핸스 기능은 **ComfyUI 재시작 후** 사용 가능합니다(백엔드 라우트 신규 추가). 나머지 UI 변경은 브라우저 새로고침이면 적용됩니다.

---

## v1.9.0 (2026-08-13)

### 🧪 MiniMax H3 ONE STUDIO (TJ) — 신규 노드 (영상 + 오디오)

> ⚠️ **실험적 기능입니다.** 외부 커스텀 노드·모델에 의존하고, 긴 영상은 클립을 이어 붙이는 방식이라 이음새가 완벽하지 않을 수 있습니다.

기존 5개 ONE STUDIO 노드가 "이미지 1장"이라면, 이 노드는 **영상 + 릴레이 루프 + 합본**이 축입니다.
설계 근거는 `SPEC_MINIMAX_H3_RELAY.md`(TJ_NODE 세션에서 인계)이며, 실제 워크플로우 37노드 서브그래프를 분석해 재구성했습니다.

**클립 릴레이**
- MiniMax H3의 프레임 격자(`17k+5`)와 VRAM 한계 때문에 한 번에 만들 수 있는 길이가 제한적 → 긴 프롬프트를 **클립 단위로 순차 생성**, 개별 저장 후 **ffmpeg로 자동 합본**
- 클립마다 큐를 새로 제출하므로 **ComfyUI의 프롬프트 간 모델 언로드가 그대로 VRAM 정리**가 됨 (별도 메모리 관리 코드 불필요)
- 클립 수 · 실제 총 길이 · 예상 소요시간을 설정 즉시 표시하고, **실측 시간으로 예상치 자동 보정**
- 클립 경계에서 중단(Stop) 가능, 클립 간 VRAM 해제 옵션, 합본 시 요청 길이로 트림 옵션

**라이브 프리뷰**
- 샘플링 중 `ModelPreviewOverrideKJ`가 디코딩한 프레임을 노드에 **실시간 표시** (스피너가 아니라 실제 영상이 만들어지는 과정을 봄)
- 프리뷰 노드 키를 노드 인스턴스별로 발급해 캔버스에 노드가 여러 개여도 프레임이 섞이지 않음
  (ComfyUI가 `parent:child` 노드 id를 확장 경로로 해석하므로 키에 콜론을 쓰지 않음)

**생성 모드 3종**
- **Text only**(T2VA) / **First·Last Frame**(FL2VA) / **Reference**(REF2VA, 이미지 최대 9장)
- Reference 모드는 전용 UNET을 별도 지정 (참조 워크플로우가 의도적으로 분리해 둔 구조를 유지)
- 연속성: Last Frame Chain / Reference / None

**그래프 구성**
- 원본 서브그래프의 헬퍼 노드(`ResolutionSelector`·`ComfyMathExpression`·`TJ_MultiSwitch`×5)를 제거하고 값을 JS에서 계산 → **37노드 → 18~28노드**, 분기가 런타임 스위치가 아니라 명시적 코드
- 선택 커스텀 노드는 `/minimax_h3_one/node_availability`로 조회해 **없으면 해당 기능만 비활성**(파이썬 최상위 import 없음 → 팩 전체 로드 실패 위험 0)

**기타**
- 프롬프트 자동 분할(`[Shot N]` 타임코드 · `---` · 빈 줄), 클립별 프롬프트 리스트
- PromptDB 파이프(`TJ_PROMPT_PIPE`) 수신 지원
- 설치 스크립트에 선택 팩 4종 추가 + 모델 다운로드 위치 안내, README에 노드 상세 문서 추가

**검증**: 6종 그래프 변형 스키마 검증 · 실제 단일 클립 생성(5.17s / 448×800 / h264+AAC) · 프리뷰 이벤트 수신 · 3클립 합본(15.53s)과 트림(7.02s)까지 라이브 확인

---

## v1.8.0 (2026-07-28)

### PromptDB 파이프 수신 — ONE STUDIO 전체 노드 (TJ_NODE 연동)

`ComfyUI-TJ_NODE`의 **`PromptDBLoader(TJ)`** 에서 고른 기록 한 줄(프롬프트 + 생성 설정)을
**`TJ_PROMPT_PIPE` 소켓 하나**로 받아, 생성 시 적용합니다. (스펙: `SPEC_PROMPTDB_PIPE.md`, TJ_NODE v2.10.1+)

- 5개 노드(Krea2 · Klein · Z-Image · Qwen2511 · SDXL)에 **`pipe` 입력** 추가 (`optional`, 타입 문자열만 — TJ_NODE 하드 의존성 없음, 미설치/미연결이면 기존과 동일 동작)
- **노드 UI는 변경하지 않음.** 실행(▶ Generate) 시점에만 파이프에 **존재하는 필드**를 임시 오버라이드하고, 그래프 빌드 후 즉시 원복. 파이프에 없는 값은 노드 설정 사용.
- 적용 필드: `positive_prompt`(현재 모드 프롬프트 교체) · `negative_prompt` · `seed` · `steps` · `cfg` · `sampler_name` · `scheduler`. `extra_settings`/`note`는 표시만.
- **모델(`model_name`)은 파이프에서 적용하지 않음** — ONE STUDIO 노드마다 필요한 모델 계열·텍스트 인코더가 다르고(Krea2 ≠ Z-Image ≠ SDXL …) 파일만으로 계열을 신뢰성 있게 판별할 방법이 없어, **각 노드는 항상 자기 설정 모델을 사용**합니다.
- **가드**: `sampler`/`scheduler`는 표준 ComfyUI 목록에 있을 때만 적용(없으면 노드값 유지), `seed=0` 유효값, `cfg` float 캐스팅.
- 각 노드 기본 사이즈를 **가로 +30 / 세로 +40** 확대 (pipe 입력으로 DOM이 노드 경계를 넘지 않도록).
- 공용 모듈 `web/shared/promptdb_pipe.js` (`readPipeRow` · `computePipeOverrides` · `applyOverridesTemp`)로 전 노드 공유.

> 적용 방식은 프론트에서 pipe 링크를 역추적해 TJ_NODE의 `/tj_node/promptdb/list_rows` API로 선택 행을 읽는 방식(스펙 방식 A). 반영하려면 ComfyUI 재시작(pipe 소켓 등록) + 브라우저 새로고침 필요.

---

## v1.7.0 (2026-07-19)

### 🧪 Krea 2 ONE STUDIO — 실험적 기능 추가 (Experimental features)

> ⚠️ **아래 기능은 실험적이며 오류가 발생할 수 있습니다. 외부 커스텀 노드 + 별도 LoRA가 필요합니다.**  
> **These features are experimental and may produce errors. They require external custom nodes + separate LoRAs.**

**IDENTITY 탭 추가 (instruction-based identity edit)**
- `comfyui-krea2edit`(`Krea2EditModelPatch` · `Krea2EditGroundedEncode`) + `krea2_identity_edit_v1_2` LoRA 사용
- 소스 이미지 + 선택적 2번째 레퍼런스(인물→장면), `ref_boost`(정체성 강도) · `grounding_px` · `fit_mode` 조절
- IDENTITY LoRA는 ⚙ Settings에서 **한 번만 등록**

**ControlNet — Depth / Canny 추가**
- **Depth**: `comfyui-krea2-controlnet`(Krea2 Control LoRA) + `DepthAnythingV2Preprocessor`. 구도·프레이밍·스케일 위주(세밀한 포즈는 느슨)
- **Canny**: `ComfyUI-NK2E`(in-context) + `CannyEdgePreprocessor`. 윤곽선 정밀 — 포즈·얼굴 방향·실루엣 재현
- 사이드 메뉴에서 **Depth/Canny 선택**, 업로드 사진을 자동 전처리, **생성 전 depth/canny 맵 미리보기** 버튼
- 컨트롤 이미지 비율에 맞춰 **롱엣지 기준 출력 크기 자동 정렬**(center-crop 왜곡 방지)
- ⚙ Settings에는 **LoRA 파일만 등록**, strength·임계값·depth 모델·해상도·channel/normalize/invert 등 **모든 조절값은 사이드 메뉴에서** 직접 제어
- depth 전처리 모델은 첫 사용 시 `depth_anything_v2_vitl.pth` 자동 다운로드 (vitg/Giant는 저장소 비공개로 미지원)

> ⚠️ depth·canny는 **LoRA 기반**이라 픽셀 단위로 정확하지 않습니다. 정확한 포즈엔 Canny, 대략적 구도엔 Depth를 권장합니다.

### 설치 / Install
- `install_requirements` 스크립트에 `comfyui-krea2edit`, `ComfyUI-NK2E` 추가 및 LoRA 다운로드 안내 출력
- README에 실험적 기능·필수 노드·모델 다운로드 위치 문서화

---

## v1.6.0 (2026-07-14)

### Bug Fixes & Improvements

**Drag-and-drop image upload — 전체 노드 적용**
- Klein, Z-Image의 `createImageUpload` 컴포넌트에 드래그앤드롭 지원 추가
- I2I, Inpaint, Upscale, Edit, Faceswap, ControlNet, Face Redraw, Outpaint, RE-BG 등 모든 이미지 업로드 영역에 동시 적용
- 드롭 시 보더 하이라이트(브랜드 컬러) 시각 피드백 포함
- (QE2511, Krea2 I2I는 기존에 지원 중이었음)

**I2I 출력 사이즈 입력 + 비율 잠금 (전체 노드)**
- I2I 소스 이미지 아래 W / H 출력 사이즈 입력 필드 추가 (8px 스냅)
- 이미지 업로드/드롭 시 원본 해상도가 W / H에 자동 입력
- 🔒 Lock ratio 체크박스 (기본 ON): 한쪽 값 변경 시 비율 유지하며 다른 쪽 자동 조정
- 사용자가 사이즈 지정 시 그래프에 `ImageScale (lanczos)` 노드를 삽입해 리사이즈 처리
- Klein / Z-Image / QE2511 / Krea2 모두 적용

**I2I 해상도 경고**
- I2I 소스 이미지 업로드 후 모델 권장 최대 해상도 초과 시 경고 표시
  - Klein (Flux.2 Klein): ~2MP 초과 시 경고
  - Z-Image Turbo: ~1MP 초과 시 경고
  - QE2511 (Qwen2.5): ~1.6MP 초과 시 경고
  - Krea2: ~4MP 초과 시 경고
- 프리셋 방식 아님 — 경고만 표시, 생성 차단 없음

**Inpaint → I2I 프롬프트 캐리오버 수정**
- Inpaint 모드에서 작성한 프롬프트가 I2I / 다른 모드로 전환 시 그대로 사용되는 버그 수정
- `getModePrompt`가 처음 방문하는 모드의 키를 `""` 로 초기화하도록 수정
- 모든 노드(Klein, Z-Image, QE2511, Krea2) 적용

**Krea2 ControlNet — T2I 추가 + 전용 LoRA를 Settings에서 사전 설정**
- 기존 I2I에만 있던 ControlNet을 T2I에도 추가 (동일 파이프라인)
- ControlNet 전용 Control LoRA + 처리 파라미터(strength / channel_mode / normalize / invert)를 ⚙ Settings에서 미리 설정·저장 → T2I·I2I가 공유
  - LoRA 종류에 따라 파라미터가 정해지므로 전역 설정이 편리 (Depth: Grayscale+MinMax / Canny·Pose: RGB+None)
  - `config_krea2.json`에 영속 저장되어 재시작 후에도 유지
- T2I/I2I 패널에는 ON/OFF 토글 + 컨트롤 이미지 업로드만 표시 (LoRA는 Settings 값 사용)
- T2I는 `EmptyLatentImage` 크기에 맞춰 컨트롤 이미지를 인코딩

**Krea2 ControlNet 감사의 말 추가**
- README.md · PROMO.md Acknowledgements 섹션에 아래 크레딧 추가:
  - Krea-2-controlnet (Tanmaypatil123) — 파이프라인 문서화
  - Patil/Krea-2-depth-controlnet — 공개 Depth Control LoRA 가중치
  - facok/comfyui-krea2-controlnet — ComfyUI 구현

---

## v1.5 (2026-06-29) 🧪

### New Features

**SDXL ONE STUDIO — 신규 노드 추가 (테스트 버전)**

SDXL 전용 올인원 노드가 패키지에 추가되었습니다. 현재 테스트 단계이며 핵심 기능은 동작합니다.

**모델 로딩 방식 선택 (CKPT / Separate)**
- Settings에서 CKPT(단일 Checkpoint 파일) 또는 Separate(UNET + CLIP-L + CLIP-G + VAE) 방식 선택 가능
- Separate 방식은 GGUF · FP8 경량 UNET 파일 지원
- 상단 뱃지가 현재 방식(CKPT / UNET)을 표시하며 전환 즉시 업데이트

**Refiner 항상 표시**
- Settings → Separate(UNET) 선택 시에도 Refiner Checkpoint 선택 항목이 사라지지 않음
- CKPT ↔ Separate 전환과 무관하게 항상 Refiner를 설정 가능
- Refiner는 `CheckpointLoaderSimple`로 독립 로딩

**Inpaint — 풀스크린 마스크 에디터**
- Z-Image와 동일한 팝업 풀스크린 마스크 에디터 내장
  - 줌 1x–32x (마우스 휠), 팬 (중클릭·우클릭 드래그)
  - 브러시 / 지우개 / 전체 지우기, 크기 슬라이더
  - Fit / 줌인 / 줌아웃 버튼
- `VAEEncodeForInpaint` 방식으로 마스크 영역 latent를 완전히 0으로 처리 → denoise=1에서도 원본 픽셀 블리드 없음
  - 기존 `VAEEncode + SetLatentNoiseMask` 방식 대비 개선

**Outpaint — 패딩 원본 비교**
- 비교 슬라이더(⇌ Compare)의 "A" 면에 회색 패딩이 포함된 원본 미리보기를 렌더링
- 캔버스 확장 방향과 크기를 시각적으로 확인 가능
- 패딩값 변경 시 미리보기 자동 업데이트

**프롬프트 템플릿 버튼 (📋)**
- 프롬프트 입력 헤더 우측에 `📋` 버튼 추가
- Klein의 템플릿 오버레이(`ui_prompt_templates.js`)를 공유 사용

**Send to Inpaint / Outpaint (Klein · QE2511)**
- 갤러리(🖼 Gallery)와 결과 스트립의 Send to에 `→ Inpaint` · `→ Outpaint` 항목 각각 추가
- 클릭 시 Paint 모드로 전환 후 Inpaint / Outpaint 서브모드로 자동 스위칭 + 이미지 자동 로드
- `switchSubMode()` 함수를 Klein / QE2511의 inpaint 핸들에 노출하여 외부에서 서브모드 전환 가능

### Bug Fixes

**[SDXL Inpaint] VAEEncode → VAEEncodeForInpaint 교체**
- 기존 `VAEEncode + GrowMask + SetLatentNoiseMask` 그래프에서 `VAEEncodeForInpaint`로 전환
- denoise=1일 때 마스크 영역에 원본 이미지가 refine되어 나오는 현상(블리드) 수정
- 영향 파일: `web/sdxl/graph_builder_sdxl.js`

**[SDXL] setTool 변수 섀도잉 버그**
- `createDrawingEngine` 반환 객체에서 `setTool: tool => { tool = tool; }` — 파라미터명이 외부 변수를 섀도잉하여 setter가 no-op으로 동작하는 버그
- `setTool: v => { tool = v; }` 로 수정
- 영향 파일: `web/sdxl/ui_inpaint_sdxl.js`

**[QE2511 Gallery] onSendTo 시그니처 불일치**
- 기존: `onSendTo(mode, field, filename)` 3인자
- 수정: `onSendTo(mode, field, subMode, filename)` 4인자로 변경 — Outpaint 서브모드 정보 전달 가능
- 영향 파일: `web/qwen2511/ui_gallery_qe2511.js` · `web/one_node_qwen2511.js`

---

## v1.5.0 (2026-07-14)

### New Features

**Krea2 I2I — ControlNet 지원 추가**

[comfyui-krea2-controlnet](https://github.com/facok/comfyui-krea2-controlnet) 패키지를 통해 Krea2 노드의 I2I 모드에 ControlNet 기능을 내장.

**ControlNet 패널 (I2I 탭 하단):**
- **ON/OFF 토글** — 비활성 시 기존 I2I 그래프와 완전히 동일하게 동작
- **Control LoRA 선택** — `models/loras/`의 Krea2 Control LoRA 파일 선택 (검색 필터 포함)
- **Strength** — Control LoRA 강도 (0~2)
- **Channel Mode** — RGB / Grayscale (Depth LoRA는 Grayscale 권장)
- **Normalize** — None / Per-image MinMax (Depth LoRA는 Per-image MinMax 권장)
- **Invert** — 컨트롤 이미지 반전
- **Control Image** 업로드 — 소스 이미지와 별개의 컨트롤 이미지 (Depth맵, Canny맵 등)

**그래프 연결 순서 (비하인드):**
```
VAEEncode(소스이미지) → Krea2ControlImageEncode(컨트롤이미지, latent) → control_latent
Model → Krea2ControlLoRALoader → Krea2ControlApply(control_latent) → KSampler
```

**설치 스크립트 업데이트:**
- `install_requirements.bat` / `install_requirements.sh`에 `comfyui-krea2-controlnet` 추가 (9번째 항목)

**공개 Depth Control LoRA:**
- [Patil/Krea-2-depth-controlnet](https://huggingface.co/Patil/Krea-2-depth-controlnet) — `models/loras/`에 배치

---

## v1.4.1 (2026-06-28)

### Bug Fixes

**[Critical] LoRA 트리거 워드가 자꾸 지워지는 버그 수정 — 전체 4개 노드**

- **`loraSelect` 검색 필터 입력 시 currentValue 오염 버그** (Klein · Z-Image `ui_common.js`)
  - 기존: `filterIn` "input" 이벤트에서 `const cur = s.value`로 표시값을 저장 → `availableLoras`가 아직 빈 배열일 때 `s.value`는 "none"으로 표시됨 → 검색 타이핑 후 `"none"` 기준으로 select 복원 → 실제 선택한 LoRA가 "none"으로 시각적으로 재표시됨
  - 수정: `s.value`(표시값) 대신 `currentValue` 변수(JS에서 관리하는 실제 선택값)를 기준으로 필터링 후 복원 — JS로 `s.value`를 변경해도 `change` 이벤트가 발생하지 않으므로 `currentValue`는 항상 사용자가 실제 선택한 값으로 유지됨

- **LoRA 변경 시 트리거 워드 처리 개선** (Klein · Z-Image · Krea2 · QE2511 전체)
  - 기존: `!lora.triggerWord` 조건만 체크 → 이미 트리거 워드가 있으면 다른 LoRA로 교체해도 fetch 안 함 → 교체 후 이전 LoRA의 트리거 워드가 그대로 남아 잘못된 값 유지
  - 수정: `v !== prev` (다른 LoRA로 교체)이면 트리거 워드를 초기화 후 새로 fetch; 같은 LoRA를 다시 선택하면 기존 트리거 워드 유지; "none" 선택 시 트리거 워드 초기화

- **strength `||1` 연산자 버그** (전체 6개 파일)
  - 기존: `parseFloat(strIn.value) || 1` — strength를 `0`으로 설정하면 `0 || 1 = 1`로 리셋되는 버그
  - 수정: `isNaN(v) ? 1 : v` — 입력이 유효하지 않을 때만 1로 대체, `0` 값은 정상 저장
  - 영향 파일: `web/klein/ui_lora_section.js` · `web/zimage/ui_lora_section.js` · `web/krea2/ui_t2i_krea2.js` (×2) · `web/qwen2511/ui_common_qe.js` · `web/qwen2511/ui_app_settings_qe.js` (×2) · `web/qwen2511/ui_faceswap_qe.js`

---

## v1.4 (2026-06-28)

### New Features

**Prompt Studio (LLM) 통합 — 프롬프트 확대창에 AI 강화 기능 추가**

TJ_NODE의 Prompt Studio를 4개 노드(Klein · QE2511 · Z-Image · Krea2) 프롬프트 확대창(`🔍`)에 직접 내장.
TJ_NODE가 설치된 경우에만 활성화되며, 미설치 시 기존 편집 기능은 그대로 동작.

**새 탭 구조:**
- `✏️ Edit` — 기존 전체화면 텍스트 편집 (변경 없음)
- `✨ Enhance` — 현재 프롬프트를 GGUF LLM으로 강화 → 결과 팝업에서 [교체하기] / [닫기] 선택
- `🖼 Image→Prompt` — 이미지 업로드 또는 URL 다운로드 → 비전 LLM으로 프롬프트 생성 → 현재 모드 프롬프트로 전송

**설정 자동 기억 (localStorage):**
- 마지막 선택한 GGUF 모델, mmproj 파일, Vision Task, Model Format, Aesthetic, GPU Layers, n_ctx, Max Tokens, Temperature, Seed를 브라우저에 저장
- 4개 노드가 동일한 설정을 공유 — 한 번 설정하면 모든 노드에서 재사용

**Enhance 탭 추가 필드:**
- `Model Format` 선택 (TJ_NODE model_formats 목록에서 자동 로드)
- `Aesthetic` 선택 (TJ_NODE aesthetics 목록에서 자동 로드)
- `Extra Instructions` 텍스트 입력

**Image→Prompt 탭 추가 필드:**
- `Model Format` / `Aesthetic` 선택 (Enhance 탭과 공유·동기화)
- `Custom Instruction` 텍스트 입력
- **URL 다운로드**: 이미지 URL 입력 + ⬇ 다운로드 버튼 → `ComfyUI/input/download/` 저장 후 자동 미리보기
- 이미지 전송 전 **1MP 이하 자동 리사이즈** (JPEG 100% 품질) — Context Overflow 방지

**AI 처리 중 로딩 오버레이:**
- Enhance / Image→Prompt 분석 중 오른쪽 결과 영역에 반투명(50%) 오버레이 + 초록 링 스피너 표시
- 분석 완료 또는 오류 시 자동 해제

**한/영 i18n 완전 지원:**
- LLM 패널 UI 전체 텍스트(탭명, 버튼, 레이블, 오류 메시지, 설치 배너 등)를 `i18n.js`로 처리
- `web/shared/i18n.js`에 `llm_*` 키군 KO/EN 추가

**TJ_NODE 미설치 시 설치 배너:**
- 미설치 상태에서 Enhance / Image→Prompt 탭 진입 시 설치 안내 UI 표시
- GitHub 링크(`designloves2/ComfyUI-TJ_NODE`) 클릭 가능
- `⬇ 지금 설치하기` 버튼 → 서버에서 `git clone` + `pip install -r requirements.txt` 자동 실행
- 설치 완료 후 ComfyUI 재시작 안내

**TJ_NODE 폴더명 자동 탐색:**
- `ComfyUI-TJ_NODE` (공식) → `ComfyUI-TJ_NODE2` (개발용) → `TJ_NODE` 순서로 자동 탐색
- 폴더명과 무관하게 동작

**신규 파일:**
- `web/shared/llm_panel.js` — 4개 노드 공용 LLM 패널 컴포넌트
- `nodes.py` 엔드포인트 5개 추가:
  - `GET /tj_studio_one/llm/models` — 설치된 GGUF/mmproj 모델 목록 + model_formats/aesthetics 반환
  - `POST /tj_studio_one/llm/enhance` — 프롬프트 텍스트 강화 (model_format · aesthetic · extra_instructions 포함)
  - `POST /tj_studio_one/llm/image_to_prompt` — 이미지 → 프롬프트 변환 (model_format · aesthetic · custom_instruction 포함)
  - `POST /tj_studio_one/llm/download_image` — URL 이미지 다운로드 → `input/download/` 저장 + base64 반환
  - `POST /tj_studio_one/llm/install_tj_node` — TJ_NODE 자동 설치 (git clone + pip)

---

## v1.3 (2026-06-28)

### Bug Fixes

**[Critical] Send to — Preview 모드에서 동작 불가**
- `nodes.py` `_make_copy_to_input_handler` 및 `qe_copy_to_input`: `type="temp"` (PreviewImage 출력) 처리 누락으로 파일을 찾지 못하는 버그 수정
- `outputMode = "preview"` 설정 시 생성된 이미지에 Send to 버튼이 동작하지 않던 문제 해결
- 영향 노드: Klein · QE2511 · Z-Image · Krea2 전체

**[Critical] Krea2 커스텀 사이즈 / Steps / CFG 입력 시 TypeError 충돌**
- `web/krea2/ui_t2i_krea2.js`: `numberField(value, min, max, step, callback)` 잘못된 인자 순서로 호출 → `callback` 위치에 숫자가 전달되어 "is not a function" 오류 발생
- 올바른 signature `numberField(value, callback, step)`으로 수정
- W · H · Steps · CFG 입력 모두 수정, 범위 검증(clamp) 추가

**Z-Image Upscale → Send to 목적지 누락**
- `web/zimage/one_node_z_image_turbo.js`: Upscale 결과의 Send to에 RE-BG · ControlNet · Face Redraw 버튼 누락
- 3개 목적지 추가 (다른 모드들과 동일하게 맞춤)

**Klein Paint → Send to 시 Outpaint 이미지 미설정**
- `web/klein/one_node_flux_2_klein.js`: Send to Paint 클릭 시 `inpaintImage`만 설정되고 `outpaintImage`는 설정되지 않아 Outpaint 서브모드에서 이미지가 없는 상태로 전환되는 버그 수정
- `inpaintImage` 설정 시 `outpaintImage`도 동시 설정

**커스텀 사이즈 입력 — 0 저장 및 8 배수 미준수**
- Klein · QE2511 · Z-Image T2I 커스텀 사이즈 입력: 필드를 지울 경우 `state.width = 0` 저장 → graph_builder가 silently 1024로 대체하는 혼란 동작 수정
- 입력값이 0이면 64로 대체, 8 배수로 자동 반올림 처리

**Textarea 클릭 시 노드 내부 패널 찌그러짐**
- 전체 4개 노드(Klein · QE2511 · Z-Image · Krea2) 동일하게 수정:
  - `root.width`: `"100%"` → `"980px"` 고정 (컨테이너 reflow 차단)
  - `rightPanel.minWidth`: `"0"` → `"640px"` (flex 레이아웃이 preview 패널을 압축 불가)
  - `computeSize`: `[NODE_W, NODE_H]` → `[NODE_W, NODE_H + _extraH]` (Override Slots 활성 시 높이 정확도)

### New Features

**Outpaint 자동 시스템 프롬프트 주입 (Klein · QE2511)**
- Outpaint 서브모드 진입 시 프롬프트 textarea placeholder가 "Scene description only — system prompt is auto-added"로 변경
- 사용자는 장면 설명만 입력, 시스템 프롬프트는 생성 시 자동으로 앞에 붙어 전송:
  ```
  Extend the composition of this image. Replace all black or rgb(R,G,B) areas
  with a logical continuation of the background and foreground. Ensure the
  transition is invisible and the new elements perfectly match the perspective
  and color palette of the original image. Scene description: [사용자 입력]
  ```
- PAD 색상(RGB)은 사용자가 설정한 값에서 자동으로 치환
- Inpaint 프롬프트와 Outpaint 프롬프트 키 분리 (`promptsByMode["inpaint"]` / `promptsByMode["outpaint"]`) — 서브모드 전환 시 각각의 프롬프트 유지

**i18n — 마스크 편집 버튼 영어 번역 누락**
- Klein · Z-Image Inpaint 모드의 "💾 마스크 저장", "⤢ 크게 편집" 버튼 텍스트가 영어 모드에서도 한글로 출력되던 문제 수정
- 저장 중 / 저장 완료 / 저장 실패 / 마스크 미칠 에러 메시지도 함께 i18n 처리
- `web/shared/i18n.js`에 `inpaint_save_btn` · `inpaint_large_edit` · `inpaint_no_mask` KO/EN 키 추가
- 영향 파일: `web/klein/ui_inpaint_klein.js` · `web/zimage/ui_inpaint.js`

### Documentation

**패키지 명칭 통일**
- README.md · PROMO.md · SETUP_GUIDE.md: `ComfyUI-TJ_NODE_ONE` / `TJ NODE ONE` 잔여 표기를 `ComfyUI-TJ_NODE_STUDIO_ONE` / `TJ NODE STUDIO ONE`으로 전부 교체

**감사의 말 추가**
- README.md (한국어) · PROMO.md (영어): 핵심 아이디어 원작자 [yanokusnir-ai](https://github.com/yanokusnir-ai) / [one-node-flux-2-klein](https://github.com/yanokusnir-ai/one-node-flux-2-klein) 크레딧 추가

**깨진 링크 수정**
- README.md: `https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit` (404) → `https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files` 로 교체

---

## v1.2

- **Outpaint color param crash** — `ImagePadKJ` color가 `[R,G,B]` 배열로 전송되어 ComfyUI가 node link로 해석 → "Bad linked input" 오류. `"R, G, B"` 문자열 포맷으로 수정
- **Klein Outpaint 새 이미지 생성 버그** — `GetImageSize`가 스케일 전 패딩 이미지를 읽어 `EmptyFlux2LatentImage`와 `VAEEncode` 크기 불일치 → 참조 컨디셔닝 무시 후 완전히 새 이미지 생성. `ImageScaleToTotalPixels` 출력에서 읽도록 수정
- **Help overlay 링크** — 모든 Help 문서 URL을 클릭 가능한 하이퍼링크로 변경
- **Language selector 위치** — Refresh Models 바로 다음에 일관되게 배치

---

## v1.1

- 패밀리 노드 확장: Z-Image Turbo · Flux.2 Klein · QE2511 · Krea2 4개 노드 체계 확립
- SeedVR2 AI Upscale 전 노드 통합
- LoRA 스택 (최대 3개) · Lightning LoRA · Camera Angle LoRA 지원
- 갤러리 · 비교 슬라이더 · 스크롤 줌 · 프롬프트 템플릿 기능 추가
- 한국어 / 영어 UI 언어 전환 지원

---

## v1.0

- 최초 릴리스
- Flux.2 Klein 9B 기반 All-in-One 단일 노드 (T2I · I2I · Edit · Paint · Faceswap · Upscale)
- [yanokusnir-ai/one-node-flux-2-klein](https://github.com/yanokusnir-ai/one-node-flux-2-klein) 아이디어에서 출발하여 다중 모델·다중 모드로 확장

# CHANGELOG — ComfyUI-TJ_NODE_STUDIO_ONE

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

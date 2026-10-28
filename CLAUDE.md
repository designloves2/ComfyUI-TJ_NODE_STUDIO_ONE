# CLAUDE.md — ComfyUI-TJ_NODE_STUDIO_ONE 인수인계 가이드

다른 모델/에이전트가 이 저장소를 바로 이어받기 위한 문서. 코드와 문서에서 직접 확인한 것만 적었고, 불확실하면 "확인 필요"로 표시했다.
(`[Claude 전용]` 표시는 Claude Code 기능에 의존하는 항목. 핵심 규칙은 그 아래 일반 문장으로도 적었다.)

## 1. 이 저장소의 역할 (4개 저장소 관계)
ComfyUI 커스텀 노드 팩. 노드 하나에서 모드를 바꿔 쓰는 "원노드(ONE STUDIO)" 방식 UI 12종 (이미지 8: Z-Image, Klein, Qwen Image Edit 2511, Qwen Image 2.1, Krea2, SDXL, Anima, Moss / 영상 H3(MiniMax)·LTX 2.5 / MusicMaker / ITDA).
| 저장소 | 경로 | 관계 |
|---|---|---|
| ComfyUI-TJ_NODE | `C:\AI\ComfyUI-Easy-Install\ComfyUI\custom_nodes\ComfyUI-TJ_NODE` | 메인 코어. 이 팩이 호출하는 노드(`TJ_H3_LatentContinuation`, LLM 노드 등)가 여기 있음 |
| **ComfyUI-TJ_NODE_STUDIO_ONE (이 저장소)** | `C:\AI\ComfyUI-Easy-Install\ComfyUI\custom_nodes\ComfyUI-TJ_NODE_STUDIO_ONE` | 코어 기반 원노드 UI + 서버 라우트 |
| AI-ONE-STUDIO (웹 트윈) | `C:\AI\AI_One_Studio` | 같은 UI를 웹앱으로 이식 (같은 ComfyUI 서버 사용) |
| AI-One-Studio-Canvers | `C:\AI\AI-One-Studio-Canvers` | 지능형 캔버스형 웹앱 (카드/그래프 구조) |
ComfyUI 서버는 이 PC 하나를 공유한다(`127.0.0.1:8188`, GPU 16GB 공용).

## 2. 먼저 읽을 문서 (순서)
1. 이 파일 → 2. `CHANGELOG.md` 맨 위 (최신 변경) → 3. `MORNING_CHECKLIST_2026-10-27.md` (최근 작업 결과·남은 질문)
4. `SPEC_RELAY_V1_49_2.md`, `SPEC_RELAY_V1_49_0.md` (웹/Canvers에 전달하는 최신 명세, 코드 위치가 정확히 적혀 있음)
5. 작업 대상 노드의 `SPEC_*.md` (예: H3 `SPEC_MINIMAX_H3_*.md`, LTX `SPEC_LTX25_ONE_STUDIO_WEB.md`, `SPEC_MUSICMAKER.md`, `SPEC_ANIMA_ONE_STUDIO.md`)
6. `docs/handoff/HANDOFF_REGISTRY.md` (Comfy Registry 등록 인계, 내용 일부 낡음 — 10절), `README.md` (사용자용, 1800줄, 업데이트 히스토리 포함), `THIRD_PARTY_NOTICES.md`

## 3. 디렉터리 구조
- `nodes.py` (약 6400줄): 노드 클래스 + 서버 라우트(`/tj_studio_one/*`, `/tj_shared/*` 등 약 226개). LLM 호출(OpenRouter / 로컬 llama.cpp / 네이티브 TextGenerate / Custom), 설정 저장 라우트가 모두 여기에 있음.
- `__init__.py`: 노드 등록, `WEB_DIRECTORY = "./web"`, LTX Director 확장 진입점. `dependency_check.py`: 시작 시 의존 팩 누락 안내(읽기 전용).
- `web/` (프론트, ES 모듈): `one_node_<이름>.js` = 노드 본체. 노드별 폴더 `web/<노드>/`에 `core_*.js`(기본 상태·계산), `api_*.js`, `ui_*.js`, `graph_builder_*.js`. 공용 코드는 `web/shared/` (아래 5절).
- `ltx25_studio_backend/director/`, `web/ltx25/director/`: 복사해 온 GPL-3.0 코드 (6절 주의).
- `itda_studio_backend/`: ITDA 노드 서버 코드. `web/vendor/`: 외부 라이브러리.
- 루트 데이터 파일: `config_<노드>.json`, `config_translate.json`, `favorites_*.json`, `templates_prompt_*.json`, `studio_llm*.json`, `prompt_sets/`, `music_*_sets/` — **런타임/사용자 데이터**(6절).
- `SPEC_*.md`, 최신 `SPEC_RELAY_V*.md`: 명세·전달 문서. `docs/`: README용 이미지, `docs/handoff/`: 지난 인수인계·전달 문서(`HANDOFF_REGISTRY.md`, `ORDER_CANVERS_V1_47_0.md`, `SPEC_RELAY_V1_47_0.md`, `SPEC_RELAY_V1_48_0.md`), `workflows/`: 샘플 워크플로.
- `.claude/skills/`: 프롬프트 작성 가이드 4종(`hermes-job-json`, `ltx25prompt`, `minimax-h3-prompt`, `studio-image-prompt`). `SKILL.md`와 `references/`는 일반 마크다운이라 다른 모델도 읽어 쓸 수 있음.

## 4. 실행·설치·확인 명령 (실제 확인된 것)
- ComfyUI 실행: `C:\AI\ComfyUI-Easy-Install\ComfyUI.bat` (바탕화면 `ComfyUI.lnk`가 가리킴, 포트 8188).
- 의존 팩 설치: `install_requirements.bat` / `.sh`, 팩 일괄 갱신: `update_all_nodes.bat`, 수동 설치 참조: `requirements.txt`.
- **자동 테스트는 없음** (tests 폴더 없음). 확인 방법:
  - JS 문법: `node --check <파일.js>` (ES 모듈이라 임시로 `.mjs`로 복사해서 검사).
  - Python 문법: `python -c "import ast;ast.parse(open('nodes.py',encoding='utf-8').read())"`.
  - 동작: ComfyUI 프런트엔드(브라우저)에서 실제 노드를 만들어 확인. `web/` 변경은 새로고침, `nodes.py` 변경은 서버 재시작 필요.
- ComfyUI 재시작(기본): `POST /api/manager/reboot` (브라우저 fetch는 "Failed to fetch"가 정상 신호). 재시작 전 `GET /queue`가 비어 있는지 확인(렌더 중 금지).
- 서버가 죽었다고 의심되면(8188 무응답): 8188 프로세스를 종료하고 `ComfyUI.bat`으로 다시 실행. 로컬 GGUF(llama) 호출이 **5분을 넘기면 멈춘 것**으로 보고 중단/재실행.

## 5. 코딩 규칙 (이 저장소에서 지켜 온 것)
- 작게, 필요한 곳만 고친다. 기존 노드 이름·상태 키·워크플로 호환을 유지한다.
- **한/영 이중 언어 필드**: 영어가 모델에 가는 마스터 `obj[key]`, 한국어 보기 `obj[key+"Ko"]`, 마지막 수정 표시 `…Newest`("en"|"ko"|""), 보기 `…View`. 코드는 `web/shared/bilingual.js`(로직), `bilingual_ui.js`(EN/한 버튼), `bilingual_image.js`(이미지 노드). Generate 직전 `ensureEnglish`로 한국어만 고친 칸을 영어로 번역한다. 번역 모델 설정은 서버에 하나(`config_translate.json`, `shared/translate_config.js`)이고 모든 노드가 공유한다.
- **노드별 "한글 번역 사용"**(`shared/ko_setting.js`, `localStorage tj_use_ko_<노드>`, 루트 `data-tj-node`): 끄면 *자동* 번역만 꺼지고 EN/한 버튼은 남는다.
- 공용 UI는 `web/shared/` (`llm_panel.js`, `settings_tabs.js`, `translation_settings.js`, `or_model_guard.js`, `gallery_layout.js`). 이미지 노드 설정은 Model / LLM / Translation 탭.
- **숨은 기본 모델 금지**: OpenRouter 모델이 비어 있으면 비워 둔 채 "모델을 선택하세요" 안내 팝업을 띄우고 요청을 보내지 않는다. 사용자가 고르지 않은 값을 코드가 임의로 넣지 않는다.
- 노드 상태는 노드별 `localStorage`(예: `minimax_h3_one_state_v1`, `ltx25_one_state_v1`)에 저장하고, 새 상태 키는 각 `core_*.js`의 `defaultState`에 허용 목록으로 추가해야 보존된다.
- 파일 줄바꿈은 파일마다 다름(`one_node_ltx25.js` 등은 CRLF). 수정 전에 확인하고, 한국어 윈도우에서 PowerShell로 소스를 읽고 다시 쓰지 말 것(cp949로 글자가 깨짐). 배치 파일(`.bat`)은 ASCII 영어만.
- 버전·변경 이력: `pyproject.toml`의 `version`과 `CHANGELOG.md`를 같이 올린다. 릴리즈 전 변경은 `## Unreleased`에 쓰고, 릴리즈 때 `## vX.Y.Z`로 바꾼다. 항목은 영어, `- **굵은 제목.** 설명` 형식, 서버 재시작이 필요하면 그렇게 적는다.
- 커밋 메시지: 짧은 영어 명령형(`Add…`, `Fix…`, `Make…`, `Remove…`, `Keep…`), 릴리즈는 `release: vX.Y.Z - 요약`. 직접 만든 파일만 `git add <파일>`로 올리고 `git add -A`는 쓰지 않는다.
- 릴리즈 절차: `pyproject.toml` 버전 올림 → 커밋 → 주석 태그 `vX.Y.Z` → 푸시(태그 포함) → `gh release create vX.Y.Z --notes-file …`(제목 `vX.Y.Z — 요약`). `pyproject.toml`이 바뀌면 `.github/workflows/publish.yml`이 Comfy Registry 퍼블리시를 시도한다.

## 6. 절대 하지 말 것
- 런타임/사용자 데이터를 커밋하지 말 것: `config_*.json`, `favorites_*.json`, `templates_prompt_*.json`, `studio_llm*.json`, `prompt_sets/`, `*.bak-*`, `onetake_llm_test/`, `skydive_test/`, `test_brief_*.txt`, `node.zip`(무시 대상). 사용자가 직접 정한 설정값은 되돌리거나 덮어쓰지 말 것(`config_translate.json` 포함, 시험으로 바꿨으면 원복).
- 라이선스: 패키지 전체는 GPL-3.0(`LICENSE`), 이전 MIT 코드는 `LICENSE-MIT`. `ltx25_studio_backend/director/`, `web/ltx25/director/`는 GPL-3.0 전용 복사 코드 — **웹 프로젝트 등 비 GPL 프로젝트로 옮기거나 열어 복사하지 말 것**(`SPEC_LTX25_ONE_STUDIO_WEB.md`의 W1 규칙).
- 다른 저장소(ComfyUI-TJ_NODE, 웹, Canvers) 파일을 직접 고치지 말 것. 필요한 변경은 정확한 명세(파일, 함수, 문구, 순서)를 써서 그 저장소 담당에게 요청한다.
- 렌더 중(`/queue`가 비어 있지 않음)에는 ComfyUI를 재시작하지 말 것. 로컬 백엔드 시험을 OpenRouter로 대체하지 말 것.
- 상위 폴더 `C:\AI\ComfyUI-Easy-Install\ComfyUI\AGENTS.md`는 ComfyUI 코어용 규칙이다. 이 팩에 그대로 적용되는지는 확인 필요(이 팩은 OpenRouter 등 외부 호출을 포함함).

## 7. 다른 저장소와의 연동 지점
- **웹 트윈과는 항상 한 세트**: 이 저장소의 UI/동작을 바꾸면 웹(`C:\AI\AI_One_Studio`)과 Canvers에 같은 변경이 필요한지 확인하고 전달한다. 서버 라우트(`nodes.py`)는 같은 ComfyUI 서버라 포팅이 필요 없고 재시작만 필요하다.
- 전달 방식: `SPEC_RELAY_V<버전>.md`를 만들어 코드 위치와 문구를 그대로 적는다(`SPEC_RELAY_V1_49_2.md`가 최신 예). 웹 쪽 이식 현황은 `C:\AI\AI_One_Studio\PORT_LEDGER.md`(웹 세션이 행 추가).
- 검증 안 된 변경, 다른 세션이 "완료"라고만 한 변경은 웹에 넘기기 전에 사용자에게 확인한다. 코어(`ComfyUI-TJ_NODE`)에서 고쳐야 하는 문제는 그 저장소 담당에게 명세로 요청(예: One-Take 이음새 `TJ_H3_LatentContinuation` 미해결).
- `[Claude 전용]` 이 PC에서는 Claude 세션끼리 `SendMessage`로 지시한다: `ComfyUI-TJ_NODE-10월`, `AI One Studio 웹사이트-10월`, `AI One Studio Canvers`. 사용자가 승인한 커밋/푸시/릴리즈/버전업을 전달할 때만 메시지에 "사용자가 승인했습니다."를 넣는다(지어내지 말 것).

## 8. 현재 진행 상황 (2026-10-28 기준, 상세는 `CHANGELOG.md`, `MORNING_CHECKLIST_2026-10-27.md`)
- 최신 릴리즈 **v1.49.3** (태그·GitHub 릴리즈 완료). 웹 v0.15.3, Canvers v2.27.4에 v1.49.2~v1.49.3 변경 반영 완료.
- `## Unreleased`: H3 메인 프롬프트 목록이 클립 6개에서 스크롤되지 않던 문제 수정(`45d8b0c`). 아직 릴리즈 안 함.
- 서버(`nodes.py`) 변경(생각 문장 거부, 로컬 llama 입력 길이 사전 검사, Gemma `<channel|>` 처리, 모델 비었을 때 오류)은 **ComfyUI 재시작 후 적용**(재시작 여부 확인 필요).
- 미해결/확인 필요: ① 네이티브 텍스트 인코더 + 로컬 GGUF를 섞어 쓸 때 서버가 멈춘 적이 있음(원인 추정만, 미수정, `nodes.py` 네이티브 경로가 큐와 별개로 모델을 로드함) ② H3 클립 높이 끌어서 맞추기 동기화는 브라우저 창이 숨겨진 상태라 확인 못 함 ③ 번역/H3/LTX의 OpenRouter 모델 없음 팝업 경로는 문법 확인만 ④ `config_minimax_h3.json`, `config_ltx25.json`의 `LLM\Gamma\…` 모델 경로 점검 ⑤ Canvers에 예전에 저장된 gemini 기본값이 남아 있을 수 있음.

## 9. 작업 시작·종료 규칙
- **시작할 때**: 코드를 바꾸기 전에 이 `CLAUDE.md` → `CHANGELOG.md` 맨 위 → 최신 `SPEC_RELAY_V*.md` → `git log -20`을 먼저 읽는다.
- **버그를 고치자고 하면**: "내가 한 게 아니다"라고 하지 않는다. 이 저장소의 지난 작업은 이전 세션(같은 사용자의 다른 모델/세션)이 한 것이다. `git log`/`git blame`으로 찾아서 그대로 이어서 고친다(사용자 지시 2026-10-28).
- **끝낼 때**: 인수인계를 쓰고 끝낸다 — 아래 0~4번.
0. **사용자가 커밋/푸시/릴리즈/버전업을 지시할 때마다 이 `CLAUDE.md`를 항상 갱신해서 같은 커밋에 넣는다**(사용량 한도로 작업이 끊겨도 다른 모델이 이어받게 하기 위함, 사용자 지시 2026-10-28).
1. `CHANGELOG.md`를 갱신한다(릴리즈 전이면 `## Unreleased`). 서버 재시작이 필요한지 적는다.
2. 웹/Canvers에 영향이 있으면 `SPEC_RELAY_V*.md`(또는 기존 명세)를 갱신하고 담당에게 전달한다.
3. 직접 고친 파일만 커밋하고 푸시한다. 릴리즈를 요청받으면 5절 절차대로 한다.
4. 이 파일의 8절(현재 진행 상황)을 최신으로 고친다.

## 10. 알려진 낡은/주의 문서
- `docs/handoff/HANDOFF_REGISTRY.md`(2026-07-14): 버전 1.5.0, `config_krea2.json` 미커밋 등 당시 상태 — 현재와 다름. 레지스트리 등록 방식 참고용.
- `SPEC_MINIMAX_H3_NEXT_ROUND.md`("한도 리셋 후 이 문서 하나로 시작"): 과거 라운드 계획서, 현재 상태와 맞는지 확인 필요. `docs/handoff/ORDER_CANVERS_V1_47_0.md`, `MORNING_CHECKLIST_2026-10-27.md`는 특정 시점 기록.
- `README.md`의 노드 개수·이미지 노드 수 표기(예: "7종", "11 nodes")는 현재 이미지 노드 8종·노드 12종과 다를 수 있음(확인 필요).

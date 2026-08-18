# SPEC — Z-Image를 공용 프롬프트 템플릿 저장소(Klein)에 합류시키기

> **해결됨 (v1.13.0)**: 아래 분석대로 진행하되, "Klein 파일을 빌려쓰는" 구조 자체를 없애고
> `web/shared/api_templates.js` + 백엔드 `/shared/prompt_templates?pool=nl|tag`
> (`templates_prompt_nl.json` / `templates_prompt_tag.json`)로 완전히 독립시켰다.
> - **nl 풀** (자연어 프롬프트): Klein · Krea2 · Z-Image · Qwen2511 · Anima — 전부 통합
> - **tag 풀** (태그/가중치 프롬프트): SDXL — 완전히 별도
> - 최초 기동 시 nl 풀은 기존 `config_klein.json` + `config_zimage.json`의
>   `t2i_templates`를 이름+프롬프트 기준으로 중복 제거해 병합한 값으로 자동 시딩된다
>   (`_seed_nl_pool_from_legacy()`, nodes.py). 데이터 유실 없이 1회성 마이그레이션.
> - `web/zimage/ui_prompt_templates.js`(예전 별도 사본)는 삭제, Z-Image도 이제
>   `../klein/ui_prompt_templates.js`를 pool="nl"로 사용.

---

## 배경

`web/klein/ui_prompt_templates.js`는 커스텀 프롬프트 템플릿(추가/수정/삭제/적용) UI와
저장 로직을 담고 있고, `web/klein/api_klein.js`의 `getConfig()`/`saveConfig()`를 통해
`/flux_klein/config` (백엔드 `config_klein.json`, 키: `t2i_templates`)에 저장한다.

**Klein 자신을 포함해 Krea2·Qwen2511·SDXL·Anima 총 5개 도구가 전부 이 파일을 그대로
동적 import해서 쓴다** (`import("./klein/ui_prompt_templates.js")` 또는
`import("../klein/ui_prompt_templates.js")`) — 즉 이 5개 도구의 "프롬프트 템플릿"은
전부 Klein 하나의 `config_klein.json`을 공유하는 하나의 목록이다. 이건 원래부터 그런
설계다(중복 구현을 피하려 파일을 재사용한 것으로 보임).

**Z-Image만 예외다.** `web/zimage/ui_prompt_templates.js`라는 별도 사본이 있고,
`web/zimage/api.js`의 `getConfig()`/`saveConfig()`를 통해 자기 전용
`/z_image_turbo/config` (`config_zimage.json`, 키: 역시 `t2i_templates`)에 저장한다.
로직은 Klein 사본과 100% 동일하고 키 이름도 우연히 같지만, 저장되는 **파일이 다르므로
Z-Image의 템플릿은 나머지 5개 도구와 전혀 공유되지 않는다.**

## 왜 지금 이 문제가 불거졌나

독립 웹사이트([AI ONE STUDIO](https://github.com/designloves2/AI_One_Studio))가 이 6개
도구를 포팅하면서, "웹에서 저장한 템플릿이 ComfyUI 노드에서도 보이고 그 반대도 성립해야
한다"는 요구사항이 나왔다. 이를 만족하려면 웹사이트 쪽 각 도구의 템플릿 저장 로직이
**원본 노드와 정확히 같은 파일에 읽고 써야** 한다. 확인 결과:

- Klein / Krea2 / Qwen2511 → 이미 원본처럼 Klein의 `/flux_klein/config`를 공유하도록
  웹사이트도 맞췄다. (SDXL은 웹사이트에 아직 템플릿 기능 자체가 없음 — 별도 이슈.)
- Anima → 웹사이트에서는 **의도적으로** Klein과 분리해 자기 전용
  `/anima_one/config`를 쓰기로 했다(모드별 프롬프트 체계가 Klein과 달라 템플릿을
  섞으면 안 맞는다는 판단). 원본 노드가 Klein을 공유하는 것과는 다른 선택이다 —
  Anima는 프롬프트 구조가 다르므로 원본 쪽도 분리하는 걸 고려해볼 만하다(선택 사항).
- Z-Image → 웹사이트도 원본과 동일하게 **아직 분리 유지 중**. 만약 Z-Image를 나머지
  5개 도구와 통합하고 싶다면, **웹사이트만 고쳐서는 안 되고 원본 노드도 같이 고쳐야
  웹↔노드 동기화가 깨지지 않는다** — 웹만 고치면 웹 Z-Image는 Klein 목록을 보는데
  실제 ComfyUI 안의 Z-Image 위젯은 여전히 자기 전용 파일을 봐서, 오히려 웹과 노드가
  달라지는 역효과가 난다.

## 원본 노드에서 필요한 변경 (Z-Image를 Klein과 통합하려는 경우)

`web/one_node_z_image_turbo.js`에서 `web/zimage/ui_prompt_templates.js`를 만들어 쓰는
부분을, Krea2/Qwen2511/SDXL/Anima가 하는 것과 동일하게
`import("../klein/ui_prompt_templates.js")`(또는 `./klein/ui_prompt_templates.js`,
Z-Image의 폴더 위치 기준 상대경로)로 바꾸면 된다. `web/zimage/ui_prompt_templates.js`
파일 자체는 이제 아무도 안 쓰게 되므로 삭제해도 무방하다(또는 하위호환을 위해
당분간 남겨둬도 무방 — 참조만 안 하면 그만).

백엔드(`nodes.py`)의 `/z_image_turbo/config` GET/POST 라우트 자체는 그대로 둬도 된다 —
`t2i_templates` 키를 더 이상 아무도 안 읽고/안 쓸 뿐, 다른 필드(모델 선택 등)는 계속
그 라우트를 쓴다.

## 결정이 필요한 사항

1. Z-Image를 Klein 공유 풀에 합류시킬지 말지 — 최종 결정 필요(위 변경은 이 경우에만
   적용).
2. Anima를 Klein에서 분리한 것처럼, SDXL도 프롬프트 구조가 다르다면 원본에서도
   분리를 고려할지 — 별도 판단 필요.

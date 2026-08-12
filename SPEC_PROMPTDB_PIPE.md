# 명세 — PromptDB 파이프를 STUDIO_ONE 노드에서 받기

작성: 2026-07-28 / 작성 주체: `ComfyUI-TJ_NODE` 세션
대상: `ComfyUI-TJ_NODE_STUDIO_ONE` 세션

## 0. 목표

`PromptDBLoader(TJ)` 에서 고른 기록 한 줄(프롬프트 + 생성 설정 전체)을 **파이프 소켓 하나로**
STUDIO_ONE 노드에 넘겨서, UI 값이 그 기록대로 채워진 뒤 생성하게 만든다.

기존 `prompt_override`(STRING) 는 프롬프트만 전달한다. 이 명세는 **seed / steps / cfg /
sampler / scheduler / model 까지 한 번에** 넘기는 것을 목표로 한다.
`PromptDBBridge(TJ)` 는 쓰지 않는다 — 파이프를 STUDIO_ONE 노드가 직접 받는다.

```
PromptDBLoader(TJ) ──pipe──> [ Krea2 One / Klein One / Z-Image One / ... ]
```

---

## 1. 타입 계약

소켓 타입은 문자열 `"TJ_PROMPT_PIPE"` 다.

```python
"pipe": ("TJ_PROMPT_PIPE",)
```

- **`ComfyUI-TJ_NODE` 를 import 할 필요가 없다.** ComfyUI 는 커스텀 타입을 단순 문자열로
  비교하므로 같은 문자열만 쓰면 연결된다.
- TJ_NODE 가 설치되지 않은 환경에서도 노드는 정상 로드된다. 그 소켓이 연결 불가 상태가
  될 뿐이므로 **하드 의존성이 생기지 않는다.**
- `optional` 에 두고, 미연결이면 지금과 동일하게 동작해야 한다.

### 전달되는 값

파이썬 `dict` 하나. 키와 타입이 계약이다.

| 키 | 타입 | 예시 |
|---|---|---|
| `positive_prompt` | `str` | `"she has huge breast, lina face, A witch with ..."` |
| `negative_prompt` | `str` | `"Exposed breasts, nipples, ... cut face"` |
| `model_name` | `str` | `"Krea2\\krea2_turbo_int8_convrot.safetensors"` |
| `seed` | `int` | `0` |
| `steps` | `int` | `8` |
| `cfg` | `float` | `1.0` |
| `sampler_name` | `str` | `"euler"` |
| `scheduler` | `str` | `"normal"` |
| `extra_settings` | `str` | `"refiner: KSampler steps=10 cfg=4.0 denoise=0.35"` |
| `note` | `str` | 사용자 자유 메모 |

**방어적으로 읽을 것.** dict 가 아닌 값이 올 수 있다고 가정한다(다른 노드가 같은 타입
문자열을 쓰는 경우 등). 참고 구현(`TJ_PromptDBBridge.unpack`):

```python
data = pipe if isinstance(pipe, dict) else {}
text   = lambda k: str(data.get(k) or "")
number = lambda k, cast, default: (lambda v: cast(v) if isinstance(v, (int, float)) else default)(data.get(k, default))
```

---

## 2. 핵심 문제 — 값을 UI 에 언제 반영할 것인가

STUDIO_ONE 의 구조상 이 부분이 설계 결정 포인트다.

`nodes.py` 의 노드 클래스는 **마지막 생성 이미지를 꺼내오는 역할만** 한다
(`_k2_last_images` 조회). 실제 생성은 웹 UI 가 자체 워크플로우를 만들어 제출한다.
따라서 파이썬 함수가 `pipe` 를 받아봤자, 그 시점은 **UI 가 이미 생성을 끝낸 뒤**다.

### 방식 A — 프론트엔드에서 링크를 역추적 (권장)

노드 JS 가 자기 `pipe` 입력의 링크를 따라가 Loader 노드를 찾고, TJ_NODE 의 HTTP API 로
선택된 행을 직접 읽어온다. **실행 없이 즉시** UI 에 반영된다.

```js
// 1) pipe 입력에 연결된 원본 노드 찾기
const slot = node.inputs.findIndex(i => i.name === "pipe");
const link = node.graph.links[node.inputs[slot]?.link];
const src  = link ? node.graph.getNodeById(link.origin_id) : null;
if (src?.type !== "TJ_PromptDBLoader") return;

// 2) 그 노드의 위젯에서 어떤 파일의 몇 번 행인지 읽기
const excelPath  = src.widgets.find(w => w.name === "excel_path")?.value;
const selectedId = Number(src.widgets.find(w => w.name === "selected_id")?.value ?? -1);
if (!excelPath || selectedId < 0) return;

// 3) 행 데이터 가져오기 (같은 오리진이라 CSRF 가드 통과)
const res  = await api.fetchApi("/tj_node/promptdb/list_rows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excel_path: excelPath }),
});
const rows = (await res.json()).rows || [];
const row  = rows.find(r => r.id === selectedId);
// row 에 위 표의 키가 그대로 들어있다 (+ id, date, thumbnail)
```

- 무선 Set/Get 으로 연결해도 **실제 링크가 만들어지므로** 같은 코드로 동작한다.
- API 가 없으면(TJ_NODE 미설치) fetch 가 실패한다 → try/catch 로 조용히 무시할 것.
- `/tj_node/promptdb/list_rows` 는 loopback + 동일 출처만 허용한다. 브라우저에서
  `api.fetchApi` 로 호출하면 조건을 만족한다.

**적용 트리거는 자동보다 명시적 버튼을 권장한다** — 예: UI 에 `📥 PromptDB 값 적용`
버튼. 사용자가 UI 에서 조정한 값을 링크가 걸려 있다는 이유로 매번 덮어쓰면 곤란하다.

### 방식 B — 파이썬 실행 + 웹소켓 푸시

`pipe` 를 받은 파이썬이 값을 저장하고 웹소켓 이벤트를 쏘면 JS 가 받아 UI 에 반영한다.
구현은 단순하지만 **워크플로우를 한 번 실행해야 값이 도착**하므로, "설정을 불러와서
그 설정으로 생성한다"는 목적과 순서가 맞지 않는다. 권장하지 않는다.

참고로 TJ_NODE 는 워크북이 바뀔 때 이 이벤트를 쏜다 — 갤러리 자동 갱신용이며,
필요하면 STUDIO_ONE 도 구독할 수 있다.

```js
api.addEventListener("tj_promptdb_updated", (e) => { /* e.detail.path */ });
```

---

## 3. 필드 매핑 시 주의점

**존재하지 않는 값을 강제로 넣지 말 것.** 기록된 모델/샘플러가 이 PC 에 없을 수 있다.
드롭다운 목록에 있을 때만 적용하고, 없으면 **건너뛰고 사용자에게 알린다.**

```js
const applyCombo = (widget, value) => {
    if (!value) return { ok: true, skipped: false };
    const values = widget?.options?.values || [];
    if (!values.includes(value)) return { ok: false, skipped: true };  // 알림 후 유지
    widget.value = value;
    widget.callback?.(value);
    return { ok: true, skipped: false };
};
```

- `model_name` 은 하위 폴더를 포함한 상대 경로다 (`"Krea2\\krea2_turbo_int8_convrot.safetensors"`).
  Windows 역슬래시가 그대로 들어있으니 비교 전 정규화가 필요할 수 있다.
- `seed` 가 `0` 인 것은 정상이다. 랜덤 시드 워크플로우에서 실제로 0 이 기록된다.
  "값이 없음"으로 오해하지 말 것.
- `cfg` 는 float 이지만 엑셀에서 `1` 처럼 정수로 읽힐 수 있다. `float()` 로 캐스팅할 것.
- `extra_settings` 는 자유 텍스트다. 리파이너 정보가 요약돼 들어있을 수 있으나
  **파싱해서 자동 적용하지 말 것** — 사람이 읽는 용도다.
- `note` 도 자유 텍스트다. 표시만 하면 된다.

### 이미 겪은 함정 (TJ_NODE 쪽에서 실제로 터진 것)

1. **위젯은 반드시 `INPUT_TYPES` 맨 뒤에 추가할 것.** ComfyUI 는 위젯 값을 **순서대로**
   복원하므로 중간 삽입은 기존 워크플로우의 값을 한 칸씩 밀어버린다.
   (실제 사례: `positive_prompt=128`, `steps="euler"`)
2. **`sampler_name` / `scheduler` / `model_name` 을 출력으로 내보낼 거면 STRING 금지.**
   KSampler 의 해당 입력과 체크포인트 로더의 `ckpt_name` 은 COMBO 라 LiteGraph 가
   STRING → COMBO 연결을 거부한다. 와일드카드 타입을 쓸 것
   (`class AnyType(str): __ne__ → False`).

---

## 4. 참고 소스

`ComfyUI-TJ_NODE` (`custom_nodes/ComfyUI-TJ_NODE/`)

| 위치 | 내용 |
|---|---|
| `nodes/utility/promptdb.py` | `TJ_PROMPT_PIPE` 정의, Loader 의 pipe 생성부(`pipe = {...}`) |
| `nodes/utility/promptdb.py` → `TJ_PromptDBBridge.unpack` | 파이프 해체 참고 구현 |
| `web/promptdb_tj.js` | 갤러리 UI, `list_rows` 호출 예 |

버전: TJ_NODE **v2.10.1** 기준. 이후 파이프에 필드가 추가되면 TJ_NODE 세션에서 먼저
바꾸고 이 문서를 갱신해 전달한다.

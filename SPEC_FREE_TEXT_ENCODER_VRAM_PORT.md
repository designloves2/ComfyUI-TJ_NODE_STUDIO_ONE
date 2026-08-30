# SPEC: Free Text Encoder VRAM — port into STUDIO_ONE

## 배경

ComfyUI-TJ_NODE(별도 저장소)에 `Free Text Encoder VRAM (TJ)` 노드를 새로 만들었다.
파이프라인은 어떤 모델이든 보통 이 순서다:

```
텍스트 인코더 로드 -> conditioning 계산 -> 디퓨즈 모델 로드 -> 샘플링 -> 디코드 -> 출력
```

ComfyUI의 스마트 메모리 관리가 알아서 내리기는 하지만, 항상 100% 깔끔하게 텍스트 인코더를
전부 내려주는 건 아니라서(일부가 VRAM에 남는 경우가 있음) 샘플링 중 여유 VRAM을 갉아먹는다.
샘플링 동안은 디퓨즈 모델만 올라와 있는 게 가장 효율적이다.

## 이미 구현/검증된 원본 (ComfyUI-TJ_NODE 저장소)

파일: `nodes/utility/free_text_encoder_vram.py`, 클래스 `TJ_FreeTextEncoderVRAM`.

```python
import comfy.model_management as mm
from ...core.tj_types import any_type

class TJ_FreeTextEncoderVRAM:
    INPUT_TYPES: required = {
        "clip": ("CLIP",),      # 내릴 텍스트 인코더
        "trigger": (any_type,), # conditioning 등 아무 타입 — 그대로 통과됨
    }
    RETURN_TYPES = (any_type, "STRING")
    RETURN_NAMES = ("trigger", "report")
    FUNCTION = "run"

    def run(self, clip, trigger):
        patcher = getattr(clip, "patcher", None)  # comfy/sd.py CLIP.__init__: self.patcher = ModelPatcher(...)
        mm.unload_model_and_clones(patcher, unload_additional_models=True)
        mm.soft_empty_cache()
        return (trigger, report_string)
```

핵심 API: `comfy.model_management.unload_model_and_clones(model_patcher, unload_additional_models=True)`
— 이건 **그 모델 하나만** 콕 집어 내린다(`unload_all_models()`처럼 전부 내리는 게 아님 — 그러면
이미 로드해둔 디퓨즈 모델까지 같이 내려가서 의미가 없어짐). `clip.patcher`가 CLIP의
ModelPatcher다(`comfy/sd.py:268`).

배선 방식(캔버스 워크플로우): `CLIPTextEncode(또는 conditioning 노드) → 이 노드(clip, trigger=positive
conditioning) → 그 출력을 Guider/Sampler로` — 즉 conditioning 계산 직후, 샘플러 실행 직전 지점에
끼워 넣는 "언로드 체크포인트" 노드.

**주의(협의된 내용)**: negative conditioning을 별도로 인코딩하는 모델(SD1.5/SDXL류, CFGGuider)은
positive만 trigger로 걸면 negative 인코딩이 이 노드보다 늦게 끝날 수 있어 순서가 안 맞을 위험이
있다 — 이런 모델을 지원하려면 trigger를 두 개(positive/negative) 받게 확장하는 게 안전하다.
MiniMax H3처럼 BasicGuider(positive만 있음)만 쓰는 모델은 이 문제가 없다.

## STUDIO_ONE에 이식할 때 반영할 것

STUDIO_ONE의 MiniMaxH3OneTJNode(등 다른 스튜디오 노드들)는 내부적으로 파이썬 코드가 직접
모델 로드/샘플링 순서를 지휘하는 구조라, 그래프에 별도 노드를 끼워 넣는 게 아니라 —
**conditioning 계산이 끝나고 샘플링 시작 직전인 지점의 파이썬 코드에 아래를 그대로 호출**하면 된다:

```python
import comfy.model_management as mm
mm.unload_model_and_clones(clip.patcher, unload_additional_models=True)
mm.soft_empty_cache()
```

- 호출 위치: text encoder(clip)로 conditioning을 다 계산한 직후, 디퓨즈 모델을 로드/샘플링에
  들어가기 직전.
- `unload_additional_models=True`로 둬서 그 clip에 딸린 clone들도 같이 내려가게 한다.
- 이미 스튜디오 노드가 릴레이(클립마다 별도 큐)로 도는 구조라면 각 클립 실행마다 이 호출을
  한 번씩 넣으면 된다.
- 부작용 확인: 이 호출 직후 같은 clip으로 추가 인코딩(negative 등)을 할 계획이 없는지 반드시
  확인하고 나서 호출 위치를 정할 것 — 이미 내려간 텍스트 인코더로 또 인코딩을 시도하면
  ComfyUI가 자동으로 다시 로드하긴 하지만(스마트 메모리 관리가 필요시 재로드함), 그러면 이
  최적화의 의미가 없어지므로 "그 clip으로 할 인코딩이 전부 끝난 시점"에 정확히 걸어야 한다.

## 검증 상태

ComfyUI-TJ_NODE 쪽에서 노드 등록/import까지 확인함(실제 GPU 실행으로 VRAM 절감 수치까지는
아직 측정 안 함 — 이식하는 쪽에서 실측 로그 남기면 좋음).

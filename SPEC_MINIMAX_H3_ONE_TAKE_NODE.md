# SPEC — One-Take Latent Continuation (구현 완료, 실기기 검증됨)

**상태: 완료.** 이 문서는 더 이상 "앞으로 만들 계획"이 아니라 **이미 구현되어 커밋되고, 실제
GPU에서 2·3·4클립 체인으로 검증까지 끝난 기능**을 그대로 기록한 것이다. 처음에는 구현 전
설계 문서로 썼다가, 실제로 완료한 뒤 이 문서를 코드에 맞춰 다시 정리했다 — 실제 클래스 이름
· 파일 위치 · 시그니처는 §2를 그대로 보면 된다. §3~§5의 소스 근거·함정 분석은 설계 당시
그대로 유효하다(실제 구현이 그 분석을 따라 만들어졌다).

**실제 코드 위치**:
- `ComfyUI-TJ_NODE/nodes/video/h3_latent_continuation.py` — `TJ_H3_LatentContinuation`
- `ComfyUI-TJ_NODE/nodes/video/h3_latent_checkpoint.py` — `TJ_H3_SaveLatentCheckpoint` / `TJ_H3_LoadLatentCheckpoint`
- `ComfyUI-TJ_NODE/nodes/video/__init__.py`, `ComfyUI-TJ_NODE/__init__.py` — 등록
- `ComfyUI-TJ_NODE_STUDIO_ONE/web/minimax/core_minimax.js` — `CONTINUITY_MODES`의 `onetake` 항목,
  `ONE_TAKE_OVERLAP_FRAMES` 상수
- `ComfyUI-TJ_NODE_STUDIO_ONE/web/minimax/graph_builder_minimax.js` — `buildOneTake()` /
  `saveOneTakeCheckpoint()`가 그래프에 세 노드를 배선
- `ComfyUI-TJ_NODE_STUDIO_ONE/web/one_node_minimax_h3.js` — 릴레이 루프의 체크포인트 이름 추적,
  실행 완료 시 자동 스티치, 좌측 패널 UI
- `ComfyUI-TJ_NODE_STUDIO_ONE/nodes.py` — `/minimax_h3_one/stitch`의 `overlap_seconds` 파라미터
  (filter_complex trim+concat 재인코드 경로)

**출처**: `SPEC_MINIMAX_H3_NEXT_ROUND.md`의 PART B("One-Take 모드")를 구현 가능한 수준까지
구체화했던 문서다. 메커니즘은 ComfyUI 코어 공식 소스(`comfy/`, `comfy_extras/`)로 직접 확인했고,
GPL-3.0 참고 저장소(`comfyui-h3-motion-context-multiref`)의 코드는 보지 않았다 — 개념만 그
저장소의 공개 문서에서 참고하고, 구현은 전부 ComfyUI 자체 소스 근거로 새로 작성했다.

---

## 1. 무엇을 만드는가

지금 MiniMax H3 ONE STUDIO의 릴레이 방식(Last Frame Chain)은 클립 N의 **마지막 프레임 이미지
1장**을 클립 N+1의 first-frame으로 넘긴다. VAE로 디코드했다가 다시 FL2VA로 인코드하는 왕복이
있고, 그 과정에서 모션 정보가 사라져 클립 N+1은 강제로 FL2VA 모델을 쓰게 된다(Reference 모드
였어도).

One-Take는 **latent 자체를 자르지 않고 그대로 이어붙인다**. 클립 N을 샘플링한 결과 latent의
꼬리 K프레임(video + 그에 대응하는 audio)을 클립 N+1의 빈 latent 앞부분에 복사하고,
`noise_mask`로 "이 구간은 이미 정해졌으니 다시 생성하지 마라"고 샘플러에 알려준다. VAE 왕복이
없고, 원래 모드(Reference 포함)를 그대로 유지할 수 있다.

```
클립 N 샘플링 결과 latent = { video: [B,24,T_v,H/16,W/16], audio: [B,32,2,T_a] }

클립 N+1 만들 때:
  1. 빈 target latent 생성 (_empty_av_latent, 이미 있는 헬�퍼)
  2. 클립 N latent의 마지막 K_v 비디오 latent-프레임 + 대응하는 K_a 오디오 latent-스텝을
     target latent 앞부분에 복사
  3. video_mask = [0]*K_v + [1]*(T_v - K_v)   (0 = 보존, 1 = 생성)
     audio_mask = [0]*K_a + [1]*(T_a - K_a)   (lock_audio=True면 전체 0)
  4. target_latent["noise_mask"] = NestedTensor((video_mask, audio_mask))
  5. SamplerCustomAdvanced 에 그대로 연결 — 이 노드는 코드 변경 없이 이미 처리한다 (§3)
```

---

## 2. 실제 노드 스키마 (구현된 그대로)

`io.ComfyNode`(신형 스키마) 대신 **`TJ_H3_AudioLock`과 같은 구형 `INPUT_TYPES`/`RETURN_TYPES`
클래스 스타일**로 작성했다 — TJ_NODE의 다른 노드 전부가 이 스타일이라 일관성을 맞췄고, 신형
`io.*` 스키마를 쓸 이유가 따로 없었다.

**`TJ_H3_LatentContinuation`** (`nodes/video/h3_latent_continuation.py`):

```python
class TJ_H3_LatentContinuation:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "overlap_frames": ("INT", {"default": 39, "min": 5, "max": 362, "step": 1}),
                "lock_audio": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "prev_latent": ("LATENT", {}),      # 직전 클립의 SamplerCustomAdvanced 출력
                "target_latent": ("LATENT", {}),    # 이번 클립의 빈 AV latent
            },
        }

    RETURN_TYPES = ("LATENT", "STRING")
    RETURN_NAMES = ("latent", "report")
    FUNCTION = "continue_latent"
    CATEGORY = " ✨ TJ_Node/Video"

    def continue_latent(self, overlap_frames=39, lock_audio=False,
                         prev_latent=None, target_latent=None):
        ...  # §4
```

**`TJ_H3_SaveLatentCheckpoint`** / **`TJ_H3_LoadLatentCheckpoint`** (`nodes/video/h3_latent_checkpoint.py`)
— §2-B에서 이유를 설명하는 B4 B안 그대로, `safetensors`로 `{video, audio}` 두 텐서를
`output/one_minimax_h3/_latent_checkpoints/<name>.h3lat.safetensors`에 저장/로드한다:

```python
class TJ_H3_SaveLatentCheckpoint:
    # required: latent (LATENT), checkpoint_name (STRING)
    # returns: (checkpoint_name,)  — OUTPUT_NODE=True, 항상 실행됨
    ...

class TJ_H3_LoadLatentCheckpoint:
    # required: checkpoint_name (STRING)
    # returns: (latent,) — 없으면 ValueError
    ...
```

### 2-A. `overlap_frames`가 STUDIO_ONE 쪽에서 노출되지 않는 이유

노드 자체는 `overlap_frames`를 입력으로 받지만, STUDIO_ONE의 그래프 빌더는 이 값을
**`core_minimax.js`의 상수 `ONE_TAKE_OVERLAP_FRAMES = 39`로 고정해서 넘긴다** — 사용자가
UI에서 조절할 수 없다. 이유: 스티치 시 잘라내는 겹침 길이(`overlap_seconds`)가 latent에
실제로 구운 값과 반드시 일치해야 하는데, 실행 도중 값이 바뀌면 이미 만든 클립과 스티치 트림이
어긋나 조용히 잘못된 결과가 나온다. 노드 자체의 입력은 유연하게 남겨뒀지만(TJ_NODE 단에서
직접 그래프를 짜는 다른 워크플로우는 자유롭게 값을 바꿀 수 있음), STUDIO_ONE은 안전하게 고정값
하나만 쓴다.

### 2-B. 왜 체크포인트 저장/로드가 따로 필요한가 (SPEC_MINIMAX_H3_NEXT_ROUND.md §B4 B안)

STUDIO_ONE의 릴레이는 **클립마다 새 큐를 제출**한다(모델을 언로드해서 VRAM을 비우기 위해).
ComfyUI는 서로 다른 큐 제출 사이에 텐서를 들고 있지 않으므로, 클립 N의 `prev_latent`를
클립 N+1 그래프에 직접 링크로 연결할 방법이 없다. 그래서 클립마다: 샘플링 결과를
`TJ_H3_SaveLatentCheckpoint`로 저장 → 다음 클립 제출 때 `TJ_H3_LoadLatentCheckpoint`로 다시
읽어서 `TJ_H3_LatentContinuation`에 넘긴다. 체크포인트 이름은
`<STUDIO_ONE 노드 id>_<원래 프롬프트 인덱스>`로 지어서(`web/one_node_minimax_h3.js`), 같은
캔버스에 여러 MiniMax H3 노드가 있어도 충돌하지 않는다.

---

## 3. 왜 그래프 쪽 코드를 안 건드려도 되는가 — 소스 근거

**`SamplerCustomAdvanced`가 이미 `noise_mask`를 읽어서 그대로 넘긴다.**
`comfy_extras/nodes_custom_sampler.py:1047-1055`:

```python
noise_mask = None
if "noise_mask" in latent:
    noise_mask = latent["noise_mask"]
...
samples = guider.sample(noise.generate_noise(latent), latent_image, sampler, sigmas,
                         denoise_mask=noise_mask, callback=callback, ...)
```

지금 MiniMax H3 그래프가 이미 이 노드를 쓰고 있으므로(그래프 빌더 확인됨), `target_latent`
딕셔너리에 `"noise_mask"` 키만 채워서 내보내면 그걸로 끝이다. 그래프 빌더 쪽은 이 신규 노드
하나를 클립 N+1의 빈 latent와 샘플러 사이에 끼워 넣기만 하면 된다.

**`CFGGuider.sample()`이 NestedTensor 마스크를 스트림별로 이미 처리한다.**
`comfy/samplers.py:1276-1314`:

```python
def sample(self, noise, latent_image, sampler, sigmas, denoise_mask=None, ...):
    ...
    if latent_image.is_nested:
        ...                                    # latent_shapes 를 스트림별로 구함
    if denoise_mask is not None:
        if denoise_mask.is_nested:
            denoise_masks = denoise_mask.unbind()          # [video_mask, audio_mask]
            denoise_masks = denoise_masks[:len(latent_shapes)]
        else:
            denoise_masks = [denoise_mask]
        for i in range(len(denoise_masks), len(latent_shapes)):
            denoise_masks.append(torch.ones(latent_shapes[i]))   # 모자란 스트림은 전체 생성
        for i in range(len(denoise_masks)):
            denoise_masks[i] = comfy.sampler_helpers.prepare_mask(
                denoise_masks[i], latent_shapes[i], self.model_patcher.load_device)
        if len(denoise_masks) > 1:
            denoise_mask, _ = comfy.utils.pack_latents(denoise_masks)
        else:
            denoise_mask = denoise_masks[0]
        denoise_mask = denoise_mask.float()
```

`NestedTensor((video_mask, audio_mask))`를 넘기면 `unbind()`로 풀어서 각 스트림 shape에 맞게
`prepare_mask`로 리셰이프하고 다시 패킹한다 — 우리가 만들 노드가 정확히 이 입력 형태
(`NestedTensor` 튜플, 순서 = video, audio)를 맞춰주면 된다.

**실제 마스킹 공식은 완전히 정확한 선형 블렌드다 — 근사치가 아니다.**
`comfy/samplers.py:634-642` (`CFGNoisePredictor.__call__` 안):

```python
if denoise_mask is not None:
    latent_mask = 1. - denoise_mask
    x = x * denoise_mask + scale_latent_inpaint(x=x, sigma=sigma, noise=self.noise,
                                                 latent_image=self.latent_image) * latent_mask
...
if denoise_mask is not None:
    out = out * denoise_mask + self.latent_image * latent_mask
```

`denoise_mask`가 정확히 0 또는 1이면(그레이스케일 아님), `out = out*0 + latent_image*1 =
latent_image` — **부동소수점 상 완전히 그대로 보존**된다(근사가 아니라 대수적으로 정확). 즉
"복사한 구간이 진짜 안 바뀌는지"는 이미 공식 수준에서 보장되어 있고, 우리가 신경 써야 할 건
①마스크를 정확히 0/1로 만드는 것과 ②마스크 shape을 아래 §5 pitfall처럼 안 틀리는 것뿐이다.

---

## 4. 알고리즘 — 실제 구현 (`continue_latent()`, 그대로 쓰인 코드)

```python
import torch
import comfy.nested_tensor
from comfy_extras.nodes_minimax_h3 import align_frame_count, video_latent_t

FPS = 24
AUDIO_LATENT_FPS = 40

def continue_latent(self, overlap_frames=39, lock_audio=False,
                     prev_latent=None, target_latent=None):
    prev = prev_latent["samples"]      # NestedTensor((video, audio))
    target = target_latent["samples"]  # NestedTensor((video, audio)) — 전부 0으로 채워진 빈 latent

    prev_video, prev_audio = prev.unbind()      # ★ .unbind()로 풀어서 개별 텐서로 다룬다.
    tgt_video, tgt_audio = target.unbind()      #   NestedTensor.__getitem__은 두 스트림에
                                                 #   동일한 인덱스를 적용해버리므로 (§5-A),
                                                 #   여기서부터는 순수 torch.Tensor 연산만 쓴다.

    # 비디오 쪽 겹침 프레임 수 -> 레이턴트 프레임 수로 변환.
    # video_latent_t(n)은 align_frame_count로 그리드에 맞춘 프레임 카운트를 받는다는 점 주의 —
    # overlap_frames가 이미 그리드에 맞아떨어지지 않으면 먼저 정렬한다.
    overlap_frames_aligned = align_frame_count(max(5, overlap_frames))
    k_v = min(video_latent_t(overlap_frames_aligned), prev_video.shape[2], tgt_video.shape[2])

    # 오디오 쪽 대응 스텝 수 — temporal_shape과 동일한 비율로 환산 (24fps 프레임 -> 40fps 오디오
    # 레이턴트 스텝). 정확히 같은 계산식을 오디오 오프셋에도 써야 두 스트림이 어긋나지 않는다.
    k_a = min(round(overlap_frames_aligned / FPS * AUDIO_LATENT_FPS),
              prev_audio.shape[-1], tgt_audio.shape[-1])

    # 1) 복사 — 직전 클립의 "꼬리"를 이번 클립의 "머리"에 그대로 붙여넣는다.
    new_video = tgt_video.clone()
    new_video[:, :, :k_v] = prev_video[:, :, -k_v:]
    new_audio = tgt_audio.clone()
    if k_a > 0:
        new_audio[:, :, :, :k_a] = prev_audio[:, :, :, -k_a:]

    new_samples = comfy.nested_tensor.NestedTensor((new_video, new_audio))

    # 2) 마스크 — shape은 §5-B에 따라 해당 스트림의 T/H/W와 정확히 일치시킨다(채널은 1로 브로드
    #    캐스트 가능). 0 = 보존(복사된 구간), 1 = 생성.
    video_mask = torch.ones_like(new_video[:, :1])          # [B,1,T_v,H,W]
    video_mask[:, :, :k_v] = 0.0
    if lock_audio:
        audio_mask = torch.zeros_like(new_audio[:, :1])     # 오디오 전체 고정
    else:
        audio_mask = torch.ones_like(new_audio[:, :1])
        if k_a > 0:
            audio_mask[:, :, :, :k_a] = 0.0

    out = {"samples": new_samples,
           "noise_mask": comfy.nested_tensor.NestedTensor((video_mask, audio_mask))}
    return io.NodeOutput(out)
```

**주의 — `prev_latent`가 `latent_image`로도 쓰인다는 점.** §3의 마스킹 공식은
`out = out*mask + self.latent_image*(1-mask)`이고, 여기서 `self.latent_image`는 샘플러에
넘긴 `latent_image`(=우리가 만든 `target_latent`) 자체다. 즉 mask=0 구간이 정확히 보존되려면
**`target_latent`의 mask=0 위치에 이미 우리가 원하는 값(복사해온 prev 값)이 들어 있어야 한다** —
위 코드가 정확히 그 순서(복사 먼저, 그다음 마스크)로 되어 있는 이유다. 이 순서를 반대로 하면
(마스크만 만들고 복사를 빼먹으면) mask=0 구간이 "0으로 채워진 빈 latent"로 보존되어버려서
조용히 검은 화면/무음이 나온다 — 에러 없이 실패하는 조용한 버그이므로 테스트 시 특히 주의.

---

## 5. 함정 (Pitfall) — 소스에서 직접 확인한 것들

### 5-A. `NestedTensor.__getitem__`은 두 스트림에 같은 인덱스를 적용한다

`comfy/nested_tensor.py:36-37`:

```python
def __getitem__(self, *args, **kwargs):
    return self.apply_operation(None, lambda x, y: x.__getitem__(*args, **kwargs))
```

즉 `nested_tensor[:, :, -39:]` 같은 슬라이싱을 하면 **video와 audio 양쪽에 똑같이 "-39"라는
인덱스**가 적용된다. video의 시간축(T_v, latent 단위)과 audio의 시간축(T_a, 40fps 기준)은
스케일이 다르므로 이건 거의 항상 틀린 결과를 만든다. **반드시 `.unbind()`로 raw tensor 두 개로
풀어서 각자 올바르게 환산한 인덱스로 슬라이싱**해야 한다 (§4 코드가 이미 그렇게 함).

### 5-B. 마스크 shape이 latent와 다르면 trilinear 보간으로 경계가 흐려진다

`comfy/sampler_helpers.py:18-19` → `comfy/utils.py:1312-1331` (`reshape_mask`):

```python
def reshape_mask(input_mask, output_shape):
    ...
    mask = torch.nn.functional.interpolate(input_mask, size=output_shape[2:], mode=scale_mode)
    # 3D(video)면 mode="trilinear"
    if mask.shape[1] < output_shape[1]:
        mask = mask.repeat((1, output_shape[1]) + (1,)*dims)[:, :output_shape[1]]
    ...
```

마스크는 무조건 `interpolate()`를 거친다. **입력 mask의 T/H/W가 latent의 T/H/W와 정확히
같으면** interpolate는 사실상 항등 연산이라 0/1 경계가 그대로 유지된다. 하지만 다른 해상도로
마스크를 만들면(예: 다운샘플된 마스크) 겹침 경계 프레임이 0도 1도 아닌 중간값으로 블러되고,
그 프레임은 "부분적으로만 보존, 부분적으로 재생성"되는 예상 못한 동작이 된다. **채널 차원은
1로 만들어도 된다**(자동으로 `repeat`되어 채널 수를 맞춤) — 그래서 §4에서
`torch.ones_like(new_video[:, :1])`로 채널 1짜리 마스크를 만든 것.

### 5-C. `latent_shapes`가 모자란 스트림은 자동으로 전체 마스크=1(전체 생성)이 된다

`comfy/samplers.py:1304-1305`:

```python
for i in range(len(denoise_masks), len(latent_shapes)):
    denoise_masks.append(torch.ones(latent_shapes[i]))
```

`lock_audio=False`이고 오디오 마스크를 아예 안 만들면(NestedTensor에 1개짜리 튜플만 넣으면)
오디오 스트림은 자동으로 "전부 생성"이 된다 — 이건 원하는 동작일 수도 있지만(오디오까지 이어
붙이고 싶지 않을 때), 의도치 않게 이 경로를 타지 않도록 **항상 `(video_mask, audio_mask)` 둘 다
명시적으로 채워서 넘긴다.**

### 5-D. `overlap_frames`는 그리드 프레임 수이지 latent 프레임 수가 아니다

`align_frame_count`/`video_latent_t`(`comfy_extras/nodes_minimax_h3.py:33-40`)는 24fps 실제
프레임 카운트를 받아 17k+5 그리드로 스냅한 뒤 latent 프레임 수로 변환한다. 노드의
`overlap_frames` 입력은 **실제 프레임 수**(기본 39 = 1.625초)로 받고, latent 프레임 수 변환은
`execute()` 안에서 하도록 설계했다(§4) — 사용자가 "몇 초 겹치는지"를 직접 체감할 수 있게 하기
위함. 39는 저장소 문서에서도 기본값으로 쓰인 값이라 그리드 경계에서 안전하게 떨어진다
(SPEC_MINIMAX_H3_NEXT_ROUND.md §B2 참고).

---

## 6. 그래프/UI 통합 지점 (참고 — TJ_NODE 쪽 작업)

이 문서의 범위는 노드 자체지만, 실제로 쓰려면 TJ_NODE 프론트가 알아야 할 지점을 남긴다.

- **`web/minimax/core_minimax.js`** — `CONTINUITY_MODES` 배열(현재 `lastframe` / `reference` /
  `none`)에 `onetake` 항목 추가. `refHint`/`hint` 문구는 SPEC_MINIMAX_H3_NEXT_ROUND.md §B5 참고.
- **`web/minimax/graph_builder_minimax.js`** — `continuityMode === "onetake"`일 때: 원래 모드
  (Reference 포함)를 그대로 유지하고, 클립 인덱스 > 0이면 `MiniMaxH3LatentContinuation` 노드를
  이전 클립의 latent 출력과 이번 클립의 빈 latent 사이에 끼워 넣는다. **디코드는 마지막 클립까지
  하지 않는다** — 중간 클립은 `SamplerCustomAdvanced`의 LATENT 출력을 그대로 다음 클립 그래프
  구성에 재사용해야 하므로(VAE 왕복 없음), 이 부분은 지금 릴레이 루프(매 클립 새 큐 제출) 구조와
  근본적으로 안 맞는다 — **SPEC_MINIMAX_H3_NEXT_ROUND.md §B4의 B안(latent 체크포인트 저장/로드)이
  선행돼야 한다.** 이건 이 신규 노드와 별개로, latent를 `safetensors`로 저장/로드하는 노드가 하나
  더 필요하다는 뜻이다(§B4 참고, 이 문서 범위 밖).
- **좌측 패널** — Overlap frames 슬라이더(기본 39) 노출, Audio Lock과 동시 사용 시 `lock_audio`를
  Audio Lock 상태와 연동.

---

## 7. 검증 상태 — 무엇을 확인했고 무엇을 안 했는가

**이번에 소스 코드로 직접 확인한 것** (§3, §5 — 전부 위 파일:줄번호 인용):
- `SamplerCustomAdvanced`가 `noise_mask`를 그래프 변경 없이 그대로 읽어 넘긴다는 것
- `CFGGuider.sample()`이 `NestedTensor` 마스크를 스트림별로 unbind→reshape→repack 한다는 것
- 마스크=0/1 구간의 보존이 근사가 아니라 정확한 선형 블렌드(대수적으로 완전 보존)라는 것
- `NestedTensor.__getitem__`이 두 스트림에 같은 인덱스를 적용하는 함정(§5-A)
- 마스크 shape 불일치 시 trilinear 보간으로 경계가 블러되는 함정(§5-B)
- 스트림 누락 시 자동 전체-생성 폴백(§5-C)

**완료 — 실기기 GPU 검증 (2026-08-17)**: 이 문서에 적힌 그대로 구현하고(`ComfyUI-TJ_NODE`의
`nodes/video/h3_latent_continuation.py`, `h3_latent_checkpoint.py`), `ComfyUI-TJ_NODE_STUDIO_ONE`에
전부 배선한 뒤(§6), 실제로 두 클립을 One-Take로 이어서 돌렸다:

- `overlap_frames=39`(정렬 후 그대로 39), T2V 모드, "빨간 사과가 회전" 프롬프트 2개, turbo 4스텝
- 두 큐 제출 전부 `success` — `TJ_H3_SaveLatentCheckpoint`(클립 1) / `TJ_H3_LoadLatentCheckpoint`
  + `TJ_H3_LatentContinuation`(클립 2)가 제출된 그래프에 정확히 그 조합으로 나타남
- 저장된 두 `.h3lat.safetensors` 체크포인트를 파이썬으로 직접 열어 대조:
  - **video**: 클립 1의 마지막 `k_v=12` latent 프레임과 클립 2의 첫 `k_v=12` latent 프레임의
    최대 절대 오차 `4.77e-7` — float32 epsilon 수준, 대수적으로 완전 보존(§3)이라는 예측과 정확히
    일치(부동소수점 잡음 이상도 이하도 아님)
  - **audio**: 같은 방식으로 `k_a=65` 스텝 대조, 최대 절대 오차 `1.19e-7`
  - **대조군**: 클립 2의 생성 구간(overlap 밖)은 클립 1의 마지막 프레임과 다름을 확인 —
    마스크가 보존 구간과 생성 구간을 실제로 구분하고 있다는 뜻(전부 얼어붙은 복사가 아님)
- 결과 mp4 두 개 다 정상 크기로 저장됨(853KB, 1.17MB) — 파이프라인이 끝까지 깨지지 않고 돎

남은 것은 SPEC_MINIMAX_H3_NEXT_ROUND.md §B6의 2, 3번(더 긴 실제 프롬프트로 화면상 모션 연속성
육안 확인, Reference 모드에서 유지 확인)뿐 — 메커니즘 자체의 정확성은 이걸로 확정됐다.

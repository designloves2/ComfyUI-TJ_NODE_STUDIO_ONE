# SPEC — MiniMax H3 ONE STUDIO (TJ) / Relay

MiniMax H3 올인원 스튜디오 노드 명세서.
작성 경위: `ComfyUI-TJ_NODE` 세션에서 사용자의 실사용 워크플로우를 분석하고 설계를 확정한 뒤,
구현은 이 repo(`ComfyUI-TJ_NODE_STUDIO_ONE`)에서 진행하기로 하여 넘긴 문서.
아래 "분석 결과"는 실제 워크플로우 JSON과 코어 소스를 직접 열어 확인한 것이고, 추측이 아니다.

---

## 0. 목표

기존 ONE STUDIO 노드들(Flux.2 Klein / Z-Image / Krea 2 / Qwen Image Edit / SDXL)과 같은 성격의
**MiniMax H3 올인원 노드**. 단, 기존 5개가 "이미지 1장 생성"인 것과 달리 이 노드는
**영상 + 릴레이 루프 + 합본**이라는 축이 추가된다.

사용자의 실제 요구:

> 프롬프트를 30~60초 이상 입력해도 알아서 클립 단위로 끊어서 여러 개의 영상을 만들고
> (일관성은 유지), 개별 클립은 전부 저장하고, 마지막에 합쳐서 하나의 영상으로 완성.

동기는 하드웨어 제약이다 — VRAM 16GB(RTX 5060 Ti)에서 한 번에 만들 수 있는 길이가 제한적이라,
길게 만들려면 잘라서 순차 생성하는 수밖에 없다.

### 하드 제약 (사용자 명시)

- **클립 길이·해상도를 코드에 하드코딩하지 말 것.** 사용자 환경에 맞추는 값이다.
  ("꼭 8초와 1.1mp는 아니어도되 이건 사용자 환경에 맞추면 되니까")
- 업스케일 모델도 RealESRGAN 고정이 아니라 **선택 가능**해야 한다.

---

## 1. 소스 워크플로우

`C:\AI\user\default\workflows\[TJ] MinimaxH3-AIO.json`

- 그룹 4개(`Ace 1.5`, `Krea2`, `MiniMaxH3`, `Post Upscale`) 중 **`MiniMaxH3` 그룹**이 대상.
  ace-step / krea2 노드는 무관하므로 무시.
- 그룹 안 최상위 노드 8개:

| id | type | 처리 |
|---|---|---|
| 247 | 서브그래프(핵심 파이프라인 37노드) | **노드 내부로 흡수** |
| 222 | `TJ_MultiImageLoader` | 외부 유지 → IMAGE 입력으로 |
| 5103 | `PixaromaLoadAudio` | 외부 유지 → AUDIO 입력으로 |
| 5100 | `TJ_Resolution` | 내부 위젯으로 흡수 |
| 239 | `Lora Loader (LoraManager)` | 외부 유지 → `model_override` 옵션 입력으로 |
| 200 | `ModelPreviewOverrideKJ` | **노드 내부로 흡수** (§4 참고) |
| 199 | `VHS_VideoCombine` | 내부 저장/스티칭이 대체 |
| 207 | `MarkdownNote` | 무시 |

### 서브그래프(247) 구성 — 37노드

**모델 로드**
- `UNETLoader` ×2 (214, 250) — 현재 둘 다 `MinimaxH3\minimax_h3_fl2va_pruned_int8_convrot.safetensors`
- `CLIPLoader` (215) — `Qwen3\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`, type=`minimax`
- `VAELoader` (216) — `minimax_h3_video_vae_fp16.safetensors`
- `VAELoader` (217) — `minimax_h3_audio_vae_fp32.safetensors`
- `UpscaleModelLoader` (243) — `RealESRGAN_x2.pth`
- `MiniMaxH3TurboLoRA` (238) — `MinimaxH3\minimax_h3_turbo_v4_step600_ema.safetensors`, strength 1

**모델 패치 체인 (분기 없는 일직선)**
`MiniMaxH3SigmaShift`(210) → `ModelPatchTorchSettings`(211) → `MiniMaxH3MemoryEfficientSageAttentionPatch`(213)
→ `PathchSageAttentionKJ`(212) → `SolAttnPatch`(205) → `MiniMaxH3Cache`(206) → `MiniMaxH3TurboLoRA`(238)

**컨디셔닝**
- `MiniMaxH3ImageToVideo` (201) — FL2VA 경로
- `MiniMaxH3ReferenceToVideo` (221) — REF2VA 경로

**샘플링**
`RandomNoise`(229), `KSamplerSelect`(230), `MiniMaxH3TurboSampler`(236), `BasicScheduler`(228),
`BasicGuider`(231), `SamplerCustomAdvanced`(225)

**디코드 / 후처리**
`VAEDecode`(226), `VAEDecodeAudio`(227), `ImageUpscaleWithModel`(242), `RTXVideoSuperResolution`(254)

**보조**
`ResolutionSelector`(218), `ComfyMathExpression`(219), `PrimitiveFloat`(220), `PrimitiveInt`(204/246)

---

## 2. 스위치 5개 해석 (중요)

워크플로우에 `TJ_MultiSwitch`가 5개 쓰였는데, 링크를 추적해 각각의 의미를 확정했다.
**이것들은 전부 노드의 위젯 몇 개로 접힌다.**

| 스위치 | A | B | 의미 → 위젯 |
|---|---|---|---|
| **232** (3그룹) | `MiniMaxH3TurboLoRA`(238) / `MiniMaxH3TurboSampler`(236) / `PrimitiveInt`(246) | 253의 출력 / `KSamplerSelect`(230) / `PrimitiveInt`(204) | 가속 방식. 모델·샘플러·steps를 **한꺼번에** 전환 |
| **253** | `SolAttnPatch`(205) | 통과(패치 없음) | 232의 B쪽에 물려 있음 |
| **249** (2그룹) | `MiniMaxH3ReferenceToVideo`(221) | `MiniMaxH3ImageToVideo`(201) | `generation_mode` (§2-1) |
| **251** | `UNETLoader`(250) | `UNETLoader`(214) | 생성 모드별 UNET 분리 선택 |
| **241** | `ImageUpscaleWithModel`(242) | `RTXVideoSuperResolution`(254) | `upscale_method` |

**232 + 253은 하나의 선택으로 묶인다** (사용자 확인):
`accel_mode` = `Turbo LoRA` / `SolAttn` / `None`
— Turbo를 고르면 TurboLoRA + TurboSampler + turbo steps가 함께 적용되고,
아니면 SolAttn 적용 여부로 갈린다.

### 2-1. 생성 모드는 3가지

워크플로우의 스위치는 2갈래지만, `MiniMaxH3ImageToVideo`의 first/last 프레임이 **optional**이라
(코어 docstring: `"t2va and fl2va: prompt (+ optional first/last keyframes)"`) 실제 모드는 3가지다.
노드에서는 `generation_mode` 드롭다운 하나로 노출한다:

| 모드 | 사용 노드 | 이미지 입력 |
|---|---|---|
| **Text only** (T2VA) | `MiniMaxH3ImageToVideo` (프레임 미연결) | 없음 |
| **First/Last Frame** (FL2VA) | `MiniMaxH3ImageToVideo` | 시작 프레임 / 끝 프레임 |
| **Reference** (REF2VA) | `MiniMaxH3ReferenceToVideo` | 레퍼런스 이미지 최대 9장 |

**이미지 조달 방식** (사용자 확인):
레퍼런스/프레임 이미지는 **이미 만들어져 있는 것을 가져다 쓴다**.
이미지 라이브러리에서 고르거나, 없으면 로컬에서 업로드. 노드 안에서 이미지를 생성하지 않는다.
(이미지 생성은 `Krea 2 ONE STUDIO (TJ)` 같은 별도 노드의 몫이고, 결과는 라이브러리에 저장될 뿐이다.
한 실행에 이미지 생성 → 영상 생성을 엮지 말 것.)
→ `TJ_MultiImageLoader`가 이미 라이브러리/로컬 선택 UI를 제공하므로 그 방식을 따르거나 재사용한다.

**251은 단순 중복이 아니다** (사용자 확인):
Reference / First-Last 각각에 **다른 UNET을 지정할 수 있도록** 일부러 분리한 것.
현재 같은 파일이 들어가 있을 뿐이므로, 노드에서도 `unet_reference` / `unet_first_last`
**두 개의 독립 드롭다운**으로 유지해야 한다.

---

## 3. 프레임 그리드 제약 (코어 소스 확인)

`comfy_extras/nodes_minimax_h3.py`:

```python
FPS = 24
def align_frame_count(n):
    while n % 17 != 5:
        n += 1
    return n
```

프레임 수가 **17k+5 격자**에만 떨어지므로, 사용자가 임의의 초를 입력하면 위로 스냅되어
"입력한 값 ≠ 실제 길이"가 된다. 혼란을 없애기 위해 **자유 입력 대신 드롭다운**으로 확정.

| 라벨 | 프레임 | 실제 길이 |
|---|---|---|
| 5.17s | 124 | 5.167s |
| 6.58s | 158 | 6.583s |
| **8.00s** | **192** | **8.000s** ← 24fps에서 유일하게 딱 떨어짐 (권장 기본값) |
| 10.13s | 243 | 10.125s |
| 15.08s | 362 | 15.083s ← 학습 상한 (`124~362`가 trained range) |

### 클립 수 / 예상 시간 계산

`clip_count = ceil(total_seconds / clip_seconds)`
사용자 환경 실측: **클립당 평균 13분 ~ 13분 30초**. `avg_minutes_per_clip` 위젯으로 조정 가능하게 하고,
실행하면서 측정한 실제 평균으로 자동 보정할 것.

60초 목표 기준 참고치:

| 클립 길이 | 클립 수 | 실제 총 길이 | 예상 소요 |
|---|---|---|---|
| 5.17s | 12 | 62.00s | 약 2h 39m |
| 6.58s | 10 | 65.83s | 약 2h 12m |
| 8.00s | 8 | 64.00s | 약 1h 46m |
| 10.13s | 6 | 60.75s | 약 1h 19m |

선택에 따라 3배 가까이 차이 나므로, **설정 변경 즉시 클립 수 / 실제 총 길이 / 예상 시간을
노드에 표시**해서 큐 돌리기 전에 판단할 수 있게 할 것.

실제 총 길이가 요청보다 길어지므로 `trim_last_clip` 옵션 제공(합본 시 요청 길이에 맞춰 자름).

---

## 4. 확정된 설계 결정

### 4-1. 큐 릴레이가 아니라 "내부 루프 + 클립마다 VRAM 정리"

사용자가 처음 "큐 루프"라고 표현했으나, 원노드라면 큐를 쪼갤 이유가 없다.
다만 **그냥 루프만 돌리면 안 된다** — 16GB에서 모델이 상주한 채 버퍼가 쌓이면
OOM보다 나쁜 **sysmem 스필 → 속도 붕괴**가 발생한다. 큐가 한 바퀴 끝날 때와 동일한 정리를
루프 안에서 재현해야 한다.

한 클립 사이클:
1. 인코딩 → 샘플링 → VAE 디코드
2. **프레임/오디오를 즉시 디스크로 저장하고 GPU 텐서는 버린다** (결과를 메모리에 들고 있으면 정리해도 무의미)
3. 다음 클립에 넘길 것만 최소로 유지 (마지막 프레임 1장을 CPU 텐서로, 또는 레퍼런스 이미지)
4. `unload_all_models()` + `soft_empty_cache(force=True)` + `cleanup_models_gc()`

근거: ComfyUI가 실행 사이에 하는 정리가 `execution.py:645`, `execution.py:769`의
`unload_all_models()` / `cleanup_models_gc()`이고, `ComfyUI-TJ_NODE`의
`nodes/llm/_llm_utils.py::_free_comfy_vram()`이 이미 같은 조합을 쓰고 있다.

**트레이드오프**: 매번 언로드하면 다음 클립에서 재로드 오버헤드가 붙는다.
`unload_between_clips` 위젯으로 켜고 끌 수 있게 할 것 (VRAM 여유 환경에선 꺼야 빠르다).

**인터럽트**: 클립 경계마다 `throw_exception_if_processing_interrupted()`로 중단 가능하게.

**진행 표시**: 큐에는 1개로만 보이므로 노드가 직접 `클립 3/8 · step 12/20`을 UI로 쏴야 한다.

### 4-2. Model Preview Override는 내부 흡수

사용자는 처음 "모델을 밖으로 뺐다가 다시 넣는" 구조를 원했으나,
그건 ComfyUI에서 **순환 참조**라 불가능하다 (같은 세션에서 실제로 `DependencyCycleError`를 겪음).

→ `ModelPreviewOverrideKJ`를 **노드 내부에서 호출**하는 것으로 확정.

구현 근거 (`comfyui-kjnodes/nodes/preview_override_node.py`):
- 그 노드가 하는 일은 모델에 래퍼를 붙이는 것뿐:
  ```python
  m.add_wrapper_with_key(
      comfy.patcher_extension.WrappersMP.OUTER_SAMPLE,
      "kj_preview_override",
      _PreviewOverrideWrapper(max_resolution, node_id, jpeg_quality,
                              suppress_default_preview, preview_frames, preview_fps, vae, tiny_vae),
  )
  ```
- 래퍼는 샘플링 중 `PromptServer.send_sync("kj_preview_override", {"node_id": ..., ...})`로
  프론트에 프레임을 전송한다 (`preview_override_node.py:642`).
- **`node_id`를 인자로 받으므로, 우리 노드의 `unique_id`를 넘기면 프리뷰가 우리 노드로 온다.**
- 프론트에서 `api.addEventListener("kj_preview_override", ...)`로 자기 node_id 것만 받아 DOM 위젯에 그린다.

**주의**: `_PreviewOverrideWrapper`는 언더스코어 프라이빗 클래스라 KJNodes 업데이트로 시그니처가
바뀔 수 있다(같은 세션에서 ComfyUI 코어가 `ref_latents` 인자를 추가해 Krea2 래퍼가 깨진 전례 있음).
인자 개수가 안 맞으면 **프리뷰만 끄고 생성은 계속**되도록 방어적으로 감쌀 것.

### 4-3. 서드파티 의존성 — 런타임 조회로

파이프라인에 다른 팩의 노드가 6종 섞여 있다:

| 노드 | 출처 팩 |
|---|---|
| `PathchSageAttentionKJ`, `ModelPreviewOverrideKJ` | comfyui-kjnodes |
| `MiniMaxH3MemoryEfficientSageAttentionPatch`, `MiniMaxH3Cache` | ComfyUI-MiniMaxH3-Cache |
| `MiniMaxH3TurboSampler`, `MiniMaxH3TurboLoRA` | comfyui-minimax-h3-turbo |
| `SolAttnPatch` | ComfyUI-SolAttn_triton |
| `RTXVideoSuperResolution` | comfyui_nvidia_rtx_nodes |

**절대 최상위 import 하지 말 것.** 하나라도 없으면 팩 전체 로드가 실패한다.
→ `NODE_CLASS_MAPPINGS`에서 **런타임 이름 조회 + try/except**로 호출하고,
없으면 해당 기능만 비활성화(위젯 disabled + 안내). 설치 batch는 사용자가 업데이트할 예정이나,
배포 팩이므로 코드 쪽 방어는 필수다.

RTX VSR은 설치가 까다로우므로, 일반 `ImageUpscaleWithModel` 경로가 항상 동작해야 한다.

---

## 5. 위젯 구성

**모델** — `unet_reference`, `unet_first_last`, `clip_name`, `clip_type`(minimax),
`vae_video`, `vae_audio`, `turbo_lora_name` + strength, `upscale_model_name`(선택 가능)
옵션 입력 `model_override` (LoraManager 등 외부 LoRA 체인 연결용 — 연결 시 내부 로딩 대신 사용)

**모드** — `generation_mode`(Text only / First-Last Frame / Reference — §2-1), `accel_mode`(Turbo LoRA / SolAttn / None),
`upscale_method`(Upscale Model / RTX VSR / None), `continuity_mode`(Last Frame Chain / Reference / None)

**길이·릴레이** — `clip_length`(드롭다운, §3), `total_seconds`, 프롬프트 필드 N개,
`unload_between_clips`, `trim_last_clip`, `avg_minutes_per_clip`

**샘플링** — steps(turbo/normal), sigma shift(video/audio), sampler, scheduler, seed, seed_mode

**프리뷰** — `preview_override` on/off, `preview_frames`, `preview_fps`, `tiny_vae`,
`max_resolution`, `jpeg_quality`

**저장** — `filename_prefix`, 개별 클립 저장(항상), 합본 출력

**입력 소켓** — `images`(IMAGE), `audio`(AUDIO, optional), `model_override`(MODEL, optional)
**출력** — 최종 합본 프레임(IMAGE), audio(AUDIO), 클립 경로 목록(STRING)

---

## 6. UI 레이아웃

위젯이 40개를 넘으므로 세로 나열은 불가. **`web/shared/`의 기존 ONE STUDIO 공용 컴포넌트를
재사용**하고, 노드 본체에는 자주 쓰는 것만 남긴다.

```
┌─ MiniMax H3 ONE STUDIO (TJ) ───────────────┐
│  [Reference ▾]  [Turbo ▾]   ⚙ Settings     │
│  clip 8.00s ▾   total 60s                  │
│  → 8 clips · 실제 64.0s · 예상 1h 46m       │
├────────────────────────────────────────────┤
│           [ 라이브 프리뷰 ]                  │
├────────────────────────────────────────────┤
│  clip 3/8 · step 12/20      00:41:12       │
│  [ Start ]  [ Stop ]  [ Reset ]            │
└────────────────────────────────────────────┘
```

- **⚙ Settings 모달** — `Models` / `Sampling` / `Output` / `Preview` 탭
- **📝 Prompts 모달** — 프롬프트 N개 스크롤 리스트, 접기/펼치기, 순서 변경,
  긴 브리프 붙여넣으면 `---` 또는 `[Shot N] 0.0~3.0s` 타임코드로 자동 분할

**신규 공용 컴포넌트 제안**: `web/shared/relay_panel.js`
— 클립 릴레이/진행/합본 UI는 나중에 다른 영상 모델(LTX2, Wan 등) ONE STUDIO에도 재사용된다.

**주의**: DOM 위젯 크기는 `computeLayoutSize`로 계산할 것.
`node.size`를 `computeSize`에 먹이면 노드가 무한히 커진다(전례 있음).

---

## 7. 프롬프트 자동 분할

사용자는 `minimax-h3-prompt` Claude 스킬로 브리프를 생성하며, 그 출력은
`[Shot N] S.S~S.Ss` 형식의 타임코드를 포함한다. 이걸 파싱해 클립 길이 단위로 묶으면
자동 분할이 결정론적으로 된다. 자유 서술이면 LLM 경유가 필요하나, 우선순위는 낮다.

---

## 8. 만드는 순서

1. **단일 클립 생성** — 지금 파이프라인을 노드 하나로 압축.
   여기서 결과가 기존 워크플로우와 동일한지 먼저 검증 (어긋나면 일찍 잡을 수 있음)
2. 프롬프트 다중 필드 + `clip_length` 드롭다운 + 클립 수/예상시간 표시
3. 내부 루프 + 클립마다 VRAM 정리 + 연속성(마지막 프레임 / 레퍼런스)
4. 클립별 저장 + 최종 스티칭 (`imageio-ffmpeg`)

---

## 9. 알려진 리스크

1. **화질/색감 드리프트** — 마지막 프레임 체이닝은 클립마다 색감·디테일이 조금씩 밀린다.
   6~8클립(48~64초)을 넘기면 눈에 띌 가능성이 높다. 레퍼런스 모드는 인물은 지키지만
   동작 연속성이 끊긴다. **둘 다 완벽하지 않으며, 이건 코드가 아니라 모델의 한계다.**
2. **오디오 이음새** — H3는 클립마다 오디오를 새로 생성하므로 합본 시 클립 경계에서 배경음이 끊긴다.
   음악을 별도로 깔거나 오디오는 나중에 입히는 편이 현실적일 수 있다.
3. **재로드 오버헤드** — §4-1의 트레이드오프.
4. **서드파티 시그니처 변경** — §4-2, §4-3.

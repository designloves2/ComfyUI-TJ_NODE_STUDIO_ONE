# SPEC — MiniMax H3 ONE STUDIO 에 Audio Lock 이식

`ComfyUI-TJ_NODE` 에 구현·검증 완료한 **MiniMax H3 Audio Lock (TJ)** 을
`MiniMaxH3OneTJNode` (MiniMax H3 ONE STUDIO) 안으로 옵션 기능으로 흡수하기 위한 명세서.

작성 경위: TJ_NODE 세션에서 독립 노드로 먼저 만들고, 원리를 ComfyUI 공식 소스로 검증한 뒤
ONE STUDIO 이식을 위해 넘긴 문서.

> ⚠️ 참조했던 서드파티 저장소(`ComfyUI-MiniMax-ContextIR`)는 **LICENSE 파일이 없어
> All Rights Reserved** 이다. 소스를 열람·복사하지 말 것. 아래 내용은 전부 ComfyUI 공식
> 구현(`comfy_extras/nodes_minimax_h3.py`, `comfy/samplers.py`, `comfy/nested_tensor.py`,
> `comfy/utils.py`)에서 직접 확인한 공개 규격이다.

---

## 1. 무엇을, 왜

H3 의 `ref_audio` 는 **참조**일 뿐이라 모델이 음색·리듬을 참고해 오디오를 **새로 생성**한다.
프롬프트에 "원본 그대로", "fully copy" 를 적어도 원본이 그대로 나오지 않는다.
립싱크·뮤직비디오·성우 더빙처럼 **오디오가 원본 그대로여야 하는 작업**에서는
샘플링 단계에서 오디오를 latent 에 고정해야 한다.

ONE STUDIO 에서는 이걸 **왼쪽 패널의 체크박스 옵션**으로 켜고 끈다(사용자 요구).

---

## 2. 원리 (검증 완료)

H3 는 비디오+오디오를 **하나의 결합 latent** 로 동시에 샘플링한다.

```
latent["samples"] → comfy.nested_tensor.NestedTensor((video, audio))
    video : [B, 24, T_v, H/16, W/16]
    audio : [B, 32, 2,  T_a]
```

| 항목 | 값 | 출처 |
|---|---|---|
| 비디오 FPS | 24 | `nodes_minimax_h3.py` `FPS` |
| 오디오 latent FPS | 40 | `AUDIO_LATENT_FPS` |
| 프레임 그리드 | `n % 17 == 5` | `align_frame_count()` |
| `T_a` | `round(frame_count / 24 * 40)` | `temporal_shape()` |
| 오디오 VAE SR | 32000 | `audio_vae.audio_sample_rate` |

### Lock 메커니즘

샘플러는 `latent["noise_mask"]`(내부명 `denoise_mask`)를 매 스텝 이렇게 적용한다
(`comfy/samplers.py` CFGGuider):

```
out = out * mask + latent_image * (1 - mask)
```

**mask = 0 인 영역은 denoise 되지 않고 원본이 계속 복원된다.**

그리고 결정적으로 — 샘플러는 **NestedTensor 형태의 mask 를 그대로 지원한다.**
`comfy/samplers.py:1297-1311`:

```python
if denoise_mask.is_nested:
    denoise_masks = denoise_mask.unbind()
    denoise_masks = denoise_masks[:len(latent_shapes)]
...
for i in range(len(denoise_masks)):
    denoise_masks[i] = comfy.sampler_helpers.prepare_mask(denoise_masks[i], latent_shapes[i], device)
if len(denoise_masks) > 1:
    denoise_mask, _ = comfy.utils.pack_latents(denoise_masks)
denoise_mask = denoise_mask.float()
```

따라서 구현은 한 줄로 요약된다:

```
비디오 mask = 1  (정상 생성)
오디오 mask = 0  (원본 고정)
```

여기에 **원본 오디오를 오디오 VAE 로 인코딩해서 latent 의 오디오 자리에 미리 넣어두면**,
샘플러가 매 스텝 그 값을 복원하므로 결과 오디오 = 원본 오디오가 된다.

### 검증 완료 (2단계)

**1) latent 레벨** — 위 샘플러 로직을 그대로 재현:

```
packed latent: (1, 1, 1181696)
packed mask  : (1, 1, 1181696)   shapes match: True
오디오가 원본과 정확히 일치: True
비디오는 모델 출력 그대로  : True
```

**2) 실기기** — 실제 워크플로우(`[TJ] MinimaxH3-AIO`)에 물려 576×320 / 124프레임(5.17s)
한 클립을 생성하고, 샘플러 결과 latent 에서 디코드한 오디오를 원본과 비교:

```
스펙트로그램 상관 (생성 vs 원본 같은 구간)  : 0.943
대조군      (생성 vs 원본 60초 지점)        : 0.314
```

`RandomNoise` 가 오디오 채널에도 노이즈를 만들지만 mask=0 이면 매 스텝 복원되므로 정상이다.
**버그가 아니다.**

### ⚠️ 검증 방법 주의 — 파형 비교는 무의미하다

H3 오디오 VAE 는 **뉴럴 코덱**이라 `encode → decode` 가 파형을 샘플 단위로 복원하지 않는다.
지각적 내용은 보존하지만 위상이 달라지므로, **원본과 결과의 파형 상관계수는 락이 완벽히
동작해도 0 근처이거나 음수가 나온다.** 실제로 첫 검증에서 -0.35 가 나와 실패로 오판했다
(RMS 는 0.0712 / 0.0693 으로 거의 같았는데, 이게 "관련은 있는데 파형이 안 맞는다"는 신호였다).

**반드시 스펙트로그램(STFT magnitude) 상관으로 비교할 것.** 그리고 같은 곡의 다른 구간을
대조군으로 두어야 한다 — 같은 곡이면 무관한 구간끼리도 0.3 정도는 나오므로, 대조군 없이
절대값만 보면 판단할 수 없다.

이 특성 때문에 **최종 오디오는 반드시 락 노드의 `audio` 출력(원본 패스스루)을 써야 한다.**
`VAEDecodeAudio` 결과를 쓰면 내용은 맞아도 음질이 코덱 왕복만큼 열화된다(§4-3 참고).

---

## 3. 백엔드 — 이미 있는 것을 그대로 쓴다

TJ_NODE 에 `TJ_H3_AudioLock` 노드가 이미 구현·검증되어 있다
(`ComfyUI-TJ_NODE/nodes/video/h3_audio_lock.py`).

ONE STUDIO 는 **그래프를 JSON 으로 조립해 제출하는 구조**
(`web/minimax/graph_builder_minimax.js`)이므로, 파이썬을 새로 쓸 필요 없이
**빌드되는 그래프에 노드를 하나 끼워 넣기만 하면 된다.**

| 항목 | 값 |
|---|---|
| `class_type` | `TJ_H3_AudioLock` |
| 입력(기능) | `av_latent`(LATENT), `audio`(AUDIO), `audio_vae`(VAE), `mode`, `strength`, `fit` |
| 입력(UI 전용) | `get_name_av_latent`, `get_name_audio`, `get_name_audio_vae`, `auto_set` |
| 출력 | `0: av_latent`(LATENT), `1: audio`(AUDIO), `2: report`(STRING) |

> ⚠️ **그래프를 JSON 으로 조립할 때 UI 전용 위젯도 반드시 채워야 한다.**
> TJ_NODE 무선 Set/Get 규약상 `get_name_*` 3개와 `auto_set` 은 `required` 에 선언되어 있어,
> 빠뜨리면 ComfyUI 검증 단계에서 `required_input_missing` 으로 **제출 자체가 거부된다**
> (실제로 겪음). 캔버스에서 쓸 때는 위젯이 알아서 채워지지만, ONE STUDIO 처럼 그래프를
> 직접 만드는 경우에는 아래 값을 명시해야 한다:
>
> ```js
> get_name_av_latent: "(none)", get_name_audio: "(none)",
> get_name_audio_vae: "(none)", auto_set: false,
> ```
| `mode` | `lock` / `remix` |
| `strength` | 0.0~1.0, `remix` 전용 (`lock` 에선 무시) |
| `fit` | `pad_silence` / `loop` / `stretch_none` |

동작 요약:
- 오디오가 목표보다 **길면 항상 트림**
- 짧으면 `fit` 에 따라 무음 패딩 / 반복
- 샘플레이트가 다르면 자동 리샘플 (`torchaudio.functional.resample`)
- `audio` 출력은 **입력 원본을 그대로 통과** (VAE 왕복 손실 회피)
- 입력 latent dict 를 in-place 수정하지 않음 (ComfyUI 출력 캐시 오염 방지)

> TJ_NODE 팩이 설치되어 있지 않은 환경도 있을 수 있으므로,
> **런타임에 `TJ_H3_AudioLock` 존재 여부를 확인**하고 없으면 체크박스를 비활성 + 안내한다.
> ONE STUDIO 는 이미 `has(avail, "TrimAudioDuration")` 처럼 서드파티 가용성을 확인하는
> 패턴을 쓰고 있으므로(`graph_builder_minimax.js`), 그 방식을 그대로 따른다.

---

## 4. 그래프 배선 변경

### 현재 (`graph_builder_minimax.js`)

```js
g[N.sampler] = { class_type: "SamplerCustomAdvanced", inputs: {
  ...,
  latent_image: [N.cond, 1],
}};
g[N.decodeA] = { class_type: "VAEDecodeAudio", inputs: { samples: [N.sampler, 0], vae: [N.vaeA, 0] } };
...
saveVideo: { images, fps: FPS, audio: [N.decodeA, 0] }
```

### Audio Lock ON 일 때

```js
// 1) 컨디셔닝과 샘플러 사이에 끼워 넣는다
g[N.audioLock] = { class_type: "TJ_H3_AudioLock", inputs: {
  av_latent: [N.cond, 1],
  audio:     <락 대상 오디오 링크>,
  audio_vae: [N.vaeA, 0],
  mode:      state.audioLockMode || "lock",
  strength:  state.audioLockStrength ?? 0.5,
  fit:       state.audioLockFit || "pad_silence",
}};

// 2) 샘플러는 락 노드의 latent 를 받는다
g[N.sampler].inputs.latent_image = [N.audioLock, 0];

// 3) 최종 오디오는 VAEDecodeAudio 가 아니라 락 노드의 audio 출력을 쓴다  ★중요
saveVideo.inputs.audio = [N.audioLock, 1];
```

**3번이 핵심이다.** latent 에서 디코드한 오디오(`N.decodeA`)는 VAE 왕복 손실이 있어
락을 걸어도 원본과 미세하게 달라진다. 락 노드의 `audio` 출력은 입력 원본을 그대로
통과시키므로 반드시 이쪽을 써야 한다. (`N.decodeA` 는 OFF 일 때 경로로 남겨둔다.)

`N.audioLock` 노드 키는 기존 명명 규칙에 맞춰 `"MM:audio_lock"` 으로 한다.

### ⚠️ 캔버스 워크플로우에 A/B 스위치로 붙일 때 — 스위치는 반드시 2개

ONE STUDIO 는 켜짐/꺼짐에 따라 그래프를 **다르게 생성**하므로 스위치 노드가 필요 없다.
하지만 같은 구성을 캔버스 워크플로우(`[TJ] MinimaxH3-AIO`)에 `Multi Switch (TJ)` 로
붙이는 경우, **latent 용과 audio 용 스위치를 반드시 별도 노드로 나눠야 한다.**

하나의 Multi Switch 에 두 그룹(latent + audio)으로 묶으면 순환이 생긴다:

```
스위치.output_1 → 225 Sampler → 227 VAEDecodeAudio → 스위치.B_2
```

ComfyUI 의 의존성은 **노드 단위**라, 그룹이 논리적으로 독립이어도 스위치 노드 전체가
227 에 의존하고 227 은 다시 스위치에 의존하는 `DependencyCycleError` 가 된다.
프루닝으로도 해결되지 않는다(스위치 노드 자체가 양쪽 의존성을 모두 갖기 때문).

노드를 2개로 분리하면 순환이 구조적으로 사라진다:

```
[latent 스위치]  A_1 = AudioLock.av_latent   B_1 = 249.output_2   → 225.latent_image
[audio  스위치]  A_1 = AudioLock.audio       B_1 = 227.AUDIO      → 서브그래프 AUDIO 출력
```

`audio 스위치` 는 227 에 의존하고 227 은 `latent 스위치` 에 의존하지만, 둘은 서로 다른
노드이므로 고리가 닫히지 않는다.

**두 스위치의 `global_switch` 를 같은 BOOLEAN 소스에 물리면 토글 하나로 동시에 전환된다.**
실제 적용본: `[TJ] MinimaxH3-AIO (AudioLock).json` — 서브그래프에 `lock_audio`(AUDIO) 와
`audio_lock_on`(BOOLEAN) 입력을 추가하고 그렇게 배선했다. 검증 결과:

| 상태 | Audio Lock | VAEDecodeAudio | 순환 |
|---|---|---|---|
| ON (A) | 실행 | 프루닝됨 | 없음 |
| OFF (B) | 프루닝됨 | 실행 | 없음 |

---

## 5. ★ 릴레이 루프에서의 오디오 분할 (가장 중요한 이식 이슈)

ONE STUDIO H3 노드는 **프롬프트 하나당 클립 하나**로 여러 번 나눠 생성한다
(`state.continuityMode`, "One prompt renders one clip").

여기서 그냥 같은 오디오를 모든 클립에 물리면 **모든 클립이 같은 구간의 오디오를 갖게 되어**,
합본이 "같은 소리가 N번 반복"되는 결과가 된다.

→ **클립 N 은 오디오의 `[N × clip_len, (N+1) × clip_len]` 구간을 받아야 한다.**

이미 레퍼런스 오디오 처리에 `TrimAudioDuration` 을 쓰고 있으므로 같은 방식으로 해결한다
(`graph_builder_minimax.js` 의 `refAudTrim` 참고):

```js
const clipSeconds = <이 클립의 실제 길이>;      // 프레임 그리드에 스냅된 값
const startSec    = clipIndex * clipSeconds;

g[N.audioSrc] = { class_type: "LoadAudio", inputs: { audio: state.lockAudioFile } };
let audioLink = [N.audioSrc, 0];

if (has(avail, "TrimAudioDuration")) {
  g[N.audioTrim] = { class_type: "TrimAudioDuration", inputs: {
    audio: audioLink, start_index: startSec, duration: clipSeconds,
  }};
  audioLink = [N.audioTrim, 0];
}
g[N.audioLock].inputs.audio = audioLink;
```

`TrimAudioDuration` 이 없으면: 잘라내지 못하므로 **첫 클립만 정상**이고 이후 클립은 같은
구간이 반복된다. 이 경우 체크박스 옆에 명확히 경고를 띄우거나, 노드가 없으면 Audio Lock
자체를 비활성화하는 편이 낫다.

> 참고: 락 노드 자체도 길이 정합을 하지만(트림/패딩/루프), 그건 "이 클립에 주어진 오디오를
> 이 클립 길이에 맞추는" 것이지 **어느 구간인지는 모른다.** 구간 선택은 그래프 쪽 책임이다.

---

## 6. UI — 왼쪽 패널 옵션

`one_node_minimax_h3.js` 의 **`Pipeline` 패널**(현재 Acceleration / Upscale /
Continuity / H3 Cache 가 있는 곳)에 추가한다. 매 실행마다 켜고 끄는 성격이므로
⚙ Settings 가 아니라 왼쪽 패널이 맞다 — `H3 Cache (step reuse)` 와 같은 판단이다.

```js
checkboxRow("Lock audio (원본 오디오 그대로)", !!state.audioLock, v => {
  state.audioLock = v; persist(); renderLeft();
}),
...(state.audioLock ? [
  // 락 대상 오디오 파일 선택
  col([label("Audio file"), <오디오 파일 선택 UI>]),
  col([label("Mode"), select([
    { value: "lock",  label: "Lock — 원본 그대로" },
    { value: "remix", label: "Remix — 부분 유지" },
  ], state.audioLockMode || "lock", v => { state.audioLockMode = v; persist(); renderLeft(); })]),
  ...(state.audioLockMode === "remix" ? [
    col([label("Strength"), numberField(state.audioLockStrength ?? 0.5,
      v => { state.audioLockStrength = v; persist(); }, 0.05)]),
  ] : []),
  col([label("Fit"), select([
    { value: "pad_silence",  label: "Pad silence" },
    { value: "loop",         label: "Loop" },
    { value: "stretch_none", label: "None (pad + warn)" },
  ], state.audioLockFit || "pad_silence", v => { state.audioLockFit = v; persist(); })]),
] : []),
```

동작 규칙:
- `mode = lock` 이면 `strength` 필드를 **숨긴다**(값은 유지 — 다시 remix 로 바꾸면 그대로 복원).
  기존 ONE STUDIO 의 조건부 렌더링 패턴(`state.upscaleMode === "rtx"` 블록)과 동일하다.
- Audio Lock 이 켜져 있는데 오디오 파일이 선택되지 않았으면 실행 전에 명확한 에러를 낸다
  (`"No audio VAE selected — open ⚙ Settings → Models."` 와 같은 형식).
- 오디오 VAE 는 이미 `state.vaeAudio` 로 설정되어 있으므로 재사용한다. 없으면 기존 에러 로직에 걸린다.

⚙ Settings 쪽에는 넣지 않는다. 다만 `Preview`/`Output` 탭 어딘가에
"Audio Lock 은 왼쪽 패널에 있다"는 한 줄 안내를 두면 기존 문구들
(`"The on/off lives in the node's left panel"`)과 일관된다.

---

## 7. 상태 저장 키

| 키 | 기본값 | 설명 |
|---|---|---|
| `state.audioLock` | `false` | 기능 on/off |
| `state.lockAudioFile` | `""` | 고정할 오디오 파일 |
| `state.audioLockMode` | `"lock"` | `lock` / `remix` |
| `state.audioLockStrength` | `0.5` | remix 전용 |
| `state.audioLockFit` | `"pad_silence"` | 길이 정합 방식 |

기존 `persist()` 에 그대로 얹으면 된다.

---

## 8. 테스트 체크리스트

> 오디오 비교는 **스펙트로그램 상관**으로 하고, 같은 곡의 다른 구간을 대조군으로 둘 것.
> 파형 상관은 뉴럴 코덱 특성상 무의미하다(§2 주의 참고). 기준: 같은 구간 0.9 이상 /
> 대조군 대비 +0.3 이상 벌어지면 락 동작.

기능:
- [x] Lock ON + 단일 클립 → 디코드 오디오가 원본과 일치 (0.943 vs 대조군 0.314, 실기기 확인)
- [ ] Lock OFF → 기존과 동일하게 `VAEDecodeAudio` 경로로 동작(회귀 없음)
- [ ] **다중 클립 릴레이에서 클립마다 오디오 구간이 이어지는지** (§5 — 가장 깨지기 쉬운 부분)
- [ ] 합본 결과의 오디오가 처음부터 끝까지 원본과 이어지는지
- [ ] `remix` + strength 변화가 결과에 반영
- [ ] 오디오가 영상보다 짧을 때 `pad_silence` / `loop` 각각 동작
- [ ] 44.1kHz 등 다른 샘플레이트 입력 시 리샘플 정상
- [ ] `TJ_H3_AudioLock` 미설치 환경에서 체크박스 비활성 + 안내
- [ ] `TrimAudioDuration` 미설치 환경에서 경고 또는 비활성

UI:
- [ ] `mode=lock` 일 때 `strength` 숨김, `remix` 로 되돌리면 값 복원
- [ ] 새로고침 후 상태 유지 (`persist`)
- [ ] Audio Lock ON + 오디오 미선택 시 실행 전 명확한 에러

---

## 9. 알려진 한계

1. **오디오는 원본이지만 립싱크는 보장되지 않는다.** 락은 "오디오를 원본으로 고정"할 뿐,
   모델이 그 오디오에 맞춰 입을 움직이도록 강제하지 않는다. 립싱크 품질은 모델과
   컨디셔닝(레퍼런스 이미지/프롬프트)에 달려 있다.
2. **클립 경계의 이음새.** 오디오를 구간별로 잘라 붙이므로, 원본 오디오 자체는 연속이지만
   각 클립이 독립 생성되는 영상 쪽에서 경계가 보일 수 있다(기존 릴레이의 일반적 한계와 동일).
3. **`remix` 는 실험적이다.** mask 를 0~1 중간값으로 두는 것이라 결과 예측이 어렵다.
   기본은 `lock` 을 쓴다.

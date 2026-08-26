# 원테이크 프롬프트 교본
### MiniMax H3 ONE STUDIO — 클립 이어붙이기 완전 가이드

> **이 교본은** 짧은 클립 여러 개를 이어서 "한 번도 안 끊긴 것처럼 보이는 긴 영상"을 만드는 방법을 다룹니다.
> 코드는 전혀 몰라도 됩니다. **문장 쓰는 법**만 알면 됩니다.
>
> 📌 예시는 **8초 클립 기준**으로 쓰여 있습니다. 작성자의 사양에서 8초가 스윗스팟이었기 때문입니다.
> 계산식은 전부 일반화해뒀으니 **본인 시스템에 맞는 길이**로 바꿔 쓰시면 됩니다.

---

## 📑 목차

1. [먼저 이것만 이해하세요](#1-먼저-이것만-이해하세요)
2. [황금 규칙 5개](#2-황금-규칙-5개)
3. [3단계 변환법 — 이 교본의 핵심](#3-3단계-변환법--이-교본의-핵심)
4. [이음매에 둬도 되는 것 / 안 되는 것](#4-이음매에-둬도-되는-것--안-되는-것)
5. [상황별 예시 모음 (32종)](#5-상황별-예시-모음-32종) ⭐
6. [VFX·소품·조연 처리법](#6-vfx소품조연-처리법)
7. [초보가 자주 하는 실수 TOP 10](#7-초보가-자주-하는-실수-top-10)
8. [AI에게 시킬 때 쓰는 지침 프롬프트](#8-ai에게-시킬-때-쓰는-지침-프롬프트)
9. [최종 체크리스트](#9-최종-체크리스트)
10. [부록 — 길이 계산표 · 타이포/전환 효과 사전 · 리빌 컨셉 10종 · 용어집](#10-부록)

---

# 1. 먼저 이것만 이해하세요

## 1-1. 클립 길이는 몇 초로 잡나요?

H3가 **한 번에 만들 수 있는 길이는 시스템 사양에 따라 다릅니다.** VRAM과 해상도에 따라 달라져요.

- 해상도를 낮추면 (예: 0.2MP) → 15초·30초도 만들 수 있습니다
- 해상도를 높이면 (예: 1.2MP) → 그만큼 짧아집니다

**내 시스템에서 안정적으로 나오는 가장 긴 길이 = 내 스윗스팟**입니다. 짧게 여러 번 테스트해서 찾으세요. 그리고 그 길이로도 부족한 영상은 **여러 클립을 만들어 이어붙입니다.**

> 📌 **이 교본의 예시는 전부 8초 기준입니다.**
> 작성자의 사양에서 8초가 스윗스팟이었기 때문이지, H3의 한계가 8초라는 뜻이 아닙니다.
> **여러분은 본인 시스템에 맞는 길이로 바꿔서 쓰시면 됩니다.** 계산식은 전부 일반화해서 드립니다.

## 1-2. 그런데 그냥 이어붙이면 티가 납니다

그래서 ONE STUDIO의 **One-Take(latent) 모드**는 이렇게 동작합니다.

> **클립 1의 마지막 1.625초를, 클립 2의 맨 앞에 물려줍니다.**

즉 **클립 2의 첫 1.625초는 새로운 내용이 아닙니다.** 클립 1의 마지막 1.625초를 **다시 한 번 그린 것**입니다. 편집기가 자동으로 둘 중 하나를 버리고 붙입니다.

```
클립 1  [──────────── 클립 길이 ────────────]
                            └─ 마지막 1.625초 ─┘
                                    ↓ 물려줌
클립 2                      [─ 첫 1.625초 ─][──── 새 내용 ────]
                             (같은 장면 재현)

최종 영상 [──── 클립1 ────][──── 클립2의 새 내용 ────]
```

## 1-3. 그래서 숫자 3개만 외우세요

| 숫자 | 의미 | 클립 길이를 바꾸면? |
|---|---|---|
| **1.625초** | 겹치는 구간 (= 39프레임) | **안 바뀜 · 항상 고정** |
| **2.0초** | 새 내용을 시작하는 지점 (1.625 + 여유 0.375) | **안 바뀜 · 항상 고정** |
| **클립 길이 − 1.625초** | 클립 하나가 실제로 늘려주는 시간 | 클립 길이 따라 바뀜 |

⭐ **중요**: 겹침 1.625초는 **클립을 몇 초로 만들든 항상 똑같습니다.** 시스템에 구워진 고정값이라 조절할 수 없어요.
그래서 **클립이 길수록 버려지는 비율이 줄어 효율이 좋습니다.**

**총 길이 = 클립 길이 + (클립수 − 1) × (클립 길이 − 1.625)**

| 예시 | 계산 | 결과 |
|---|---|---|
| 8초 클립 9개 | 8 + 8 × 6.375 | **59.0초** |
| 15초 클립 5개 | 15 + 4 × 13.375 | **68.5초** |
| 30초 클립 3개 | 30 + 2 × 28.375 | **86.8초** |

## 1-4. 한 클립의 구조

```
0.0 ──── 1.625 ── 2.0 ──────────── (끝−1.7) ──── 클립 끝
│  이음매 구간   │여유│  새로운 전개    │ 다음 이음매 준비 │
│               │    │                │                 │
│ 이전 클립의    │    │ 이야기가        │ 다음 클립에      │
│ 끝을 복사      │    │ 진행되는 구간   │ 물려줄 상태      │
└───────────────┴────┴────────────────┴─────────────────┘
```

**앞의 1.625초와 뒤의 1.7초는 클립 길이와 상관없이 고정입니다.** 가운데 "새로운 전개" 구간만 늘어납니다.

| 클립 길이 | 새로운 전개 구간 | 그 길이 |
|---|---|---|
| 8초 | 2.0 ~ 6.3초 | 4.3초 |
| 15초 | 2.0 ~ 13.3초 | 11.3초 |
| 30초 | 2.0 ~ 28.3초 | 26.3초 |

---

# 2. 황금 규칙 5개

## ⭐ 규칙 1 — `[Shot 2]`를 절대 쓰지 마세요

H3 문법에서 `[Shot 2] At 00:02.000`은 **"여기서 컷하라"**는 뜻입니다. 원테이크를 만드는데 컷을 넣으면 안 되겠죠.

```
❌ 나쁜 예
[Shot 1] 카메라가 그녀를 따라간다.
[Shot 2] At 00:02.000, 카메라가 얼굴로 다가간다.
   → 2초에서 화면이 툭 끊깁니다

✅ 좋은 예
[Shot 1] 카메라가 그녀를 따라간다. At 00:02.000, 카메라가 얼굴로 다가간다.
   → 한 문단 안에서 자연스럽게 이어집니다
```

**`[Shot 1]` 하나만 쓰고, 2초 전개는 같은 문단 안에 `At 00:02.000, ...`으로 씁니다.**

> 📌 **오해 방지**: `[Shot N]`이 **나쁜 문법이라는 뜻은 아닙니다.** 컷을 의도적으로 쓰는 영상
> (빠른 컷의 캐릭터 리빌, 광고 편집 등)에서는 `[Shot 2] [Shot 3]`…이 **정상적이고 올바른** 문법입니다.
> 오직 **원테이크에서만** 쓰지 않는 것입니다. → 관련 어휘는 [10-5 ④절](#-그래픽-컷-편집-원테이크가-아닐-때-)

## ⭐ 규칙 2 — "시작한다"가 아니라 "이미 하고 있다"

클립 2는 이미 움직이는 상태를 물려받습니다. "시작한다"고 쓰면 프롬프트가 물려받은 영상과 싸웁니다.

| ❌ 금지 | ✅ 권장 |
|---|---|
| `She begins to walk.` (걷기 시작한다) | `She is already walking.` (이미 걷고 있다) |
| `The camera starts moving.` (움직이기 시작한다) | `The camera is already moving.` (이미 움직이는 중) |
| `He turns to look.` (돌아본다) | `He is already turning to look.` (돌아보는 중이다) |

## ⭐ 규칙 3 — 클립은 "멈춤"이 아니라 "움직임"으로 끝내세요

클립의 마지막 상태가 다음 클립에 그대로 넘어갑니다. 멈춘 채로 끝내면 다음 클립도 멈춘 채로 시작합니다.

```
❌ ... the camera stops on her face.
   (카메라가 그녀 얼굴에서 멈춘다)

✅ ... ending with the camera still drifting slowly toward her face.
   (카메라가 여전히 그녀 얼굴 쪽으로 천천히 다가가는 상태로 끝난다)
```

## ⭐ 규칙 4 — 빠른 동작은 클립 끝 1.7초 전에 끝내세요

클립의 **마지막 1.7초**가 다음 클립에 물려집니다. 여기에 빠르고 되돌릴 수 없는 동작이 걸리면 두 클립이 다르게 그려서 화면이 튑니다.

**마지막 1.7초에는 느리고 지속되는 동작만.**

| 클립 길이 | 빠른 동작 마감선 |
|---|---|
| 8초 | 6.3초 |
| 10초 | 8.3초 |
| 15초 | 13.3초 |
| 30초 | 28.3초 |

## ⭐ 규칙 5 — 이음매 문장은 창작하지 말고 복사하세요

클립 1의 끝 문장과 클립 2의 시작 문장은 **거의 같은 단어**여야 합니다. 살짝만 바꿔도 화면이 튑니다.

---

# 3. 3단계 변환법 — 이 교본의 핵심

이것만 익히면 됩니다.

### 1단계 — 클립 1의 마지막에 "그 순간의 사진"을 묘사한다

동작 서술로 끝내지 말고, **클립의 마지막 프레임을 정지화면으로 찍었을 때 뭐가 보이는지**를 씁니다.

```
✅ ..., ending with her mid-stride, her right foot forward, her coat still
   swinging behind her, the camera level with her shoulder.
```
> 한글: …오른발이 앞에 나온 채 걷는 도중이고, 코트는 뒤에서 흔들리고 있으며, 카메라는 그녀 어깨 높이에 있는 상태로 끝난다.

### 2단계 — 그 문장을 클립 2 맨 앞에 복사한다

**명사구는 글자 하나 안 바꾸고 그대로** 옮깁니다.

### 3단계 — 동사만 바꾸고 `still`을 붙인다

| 클립 1 (끝) | → | 클립 2 (시작) |
|---|---|---|
| `her mid-stride` | → | `she **is already** mid-stride` |
| `her right foot forward` | → | `her right foot **still** forward` |
| `her coat swinging behind her` | → | `her coat **still** swinging behind her` |
| `the camera level with her shoulder` | → | `the camera **still** level with her shoulder` |

### 완성된 클립 2 첫 문장

```
The clip continues the same unbroken take; she is already mid-stride with
her right foot still forward, her coat still swinging behind her, the camera
still level with her shoulder. The entire clip is a single uninterrupted
shot with no cuts.
[Shot 1] ...
```
> 한글: 같은 끊기지 않은 촬영이 계속된다. 그녀는 이미 걷는 도중이고 오른발이 앞에 나와 있으며, 코트는 여전히 뒤에서 흔들리고, 카메라는 여전히 어깨 높이에 있다. 이 클립 전체는 컷 없는 하나의 샷이다.

---

# 4. 이음매에 둬도 되는 것 / 안 되는 것

**핵심: 지속 가능 ≠ 정지.** 긴장을 유지한 채 계속되는 상태면 됩니다.

## 🟢 안전 (이음매에 둬도 됨)

| 종류 | 이유 |
|---|---|
| 걷기·달리기·수영 | 반복되는 순환 동작 |
| 차량·자전거 주행 | 일정한 속도의 직선 운동 |
| 응시·대화·호흡 | 거의 정지, 변화 적음 |
| 천천히 도는 동작 | 느린 단일 방향 |
| 머리카락·옷 날림 | 미세한 지속 운동 |
| 미끄러지며 감속 | 예측 가능한 감속 |
| 카메라만 이동 | 인물 변화 없음 |
| **슬로모션 중인 모든 것** | 1.625초가 작은 변화만 담음 |

## 🔴 위험 (이음매에 두면 안 됨)

| 종류 | 이유 |
|---|---|
| 점프의 도약~착지 | 탄도 궤적, 재현 어려움 |
| 타격·베기·발차기 | 0.3초짜리 동작, 위상 안 맞음 |
| 물건 던지기·받기 | 1회성, 궤적 특정 불가 |
| 문 열기·스위치 누르기 | 상태가 급변 |
| 표정 급변 (웃음 터짐 등) | 얼굴 형태 변화 |
| 충돌·폭발 순간 | 파편 위치 재현 불가 |
| 춤의 결정 포즈 순간 | 정확한 타이밍 필요 |

---

# 5. 상황별 예시 모음 (32종)

> **사용법**: 상황에 맞는 예시를 찾아 `[대괄호]` 부분만 바꿔 쓰세요.
> 각 예시는 **클립 1의 끝** / **클립 2의 시작** 쌍으로 되어 있습니다.

---

## 🚶 A. 이동

### A-1. 걷기 (일반 속도)

**클립 1 끝**
```
..., ending with her still walking forward at the same steady pace, mid-stride,
her arms swinging naturally, her hair and coat moving with each step, the
camera tracking alongside her at matched speed.
```
> 그녀는 여전히 같은 속도로 걷는 중이고, 걸음 도중이며, 팔이 자연스럽게 흔들리고, 머리카락과 코트가 걸음마다 움직이고, 카메라는 같은 속도로 옆에서 따라간다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already walking forward at
the same steady pace, mid-stride, her arms still swinging naturally, her hair
and coat still moving with each step, the camera still tracking alongside her
at matched speed. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] She keeps walking through [장소], [주변 요소] passing by her.
At 00:02.000, [새로운 전개].
```
> 그녀는 이미 같은 속도로 걷고 있고… (동일). 그녀는 [장소]를 계속 걸어가고 [주변 요소]가 지나간다. 2초에 [새로운 전개].

💡 **포인트**: `pace(속도)` `mid-stride(걸음 도중)` `arms swinging(팔 흔들림)` 세 개는 꼭 넣으세요. 빠지면 이음매에서 보폭이 튑니다.

---

### A-2. 빠르게 걷기 (성큼성큼)

**클립 1 끝**
```
..., ending with her striding forward quickly and purposefully, mid-step, her
shoulders squared and her coat flaring behind her, the camera pushing along
just ahead of her at the same brisk speed.
```
> 그녀는 빠르고 단호하게 성큼성큼 걷는 중이고, 어깨를 편 채 코트가 뒤에서 펄럭이며, 카메라는 같은 빠른 속도로 그녀 바로 앞에서 밀려간다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already striding forward
quickly and purposefully, mid-step, her shoulders still squared and her coat
still flaring behind her, the camera still pushing along just ahead of her at
the same brisk speed. The entire clip is a single uninterrupted shot with no
cuts.
[Shot 1] ...
```

💡 **포인트**: 빠른 걸음은 `purposefully(단호하게)` 같은 태도 단어를 넣으면 자세가 안 흔들립니다.

---

### A-3. 달리기 (조깅~중간 속도)

**클립 1 끝**
```
..., ending with him running at a steady rhythm, mid-stride, his breathing
even, his arms held in a relaxed running form, the camera tracking laterally
beside him at matched speed.
```
> 그는 일정한 리듬으로 달리는 중이고, 호흡이 고르며, 팔은 편안한 달리기 자세이고, 카메라는 같은 속도로 옆에서 따라간다.

**클립 2 시작**
```
The clip continues the same unbroken take; he is already running at the same
steady rhythm, mid-stride, his breathing still even, his arms still held in
the same relaxed running form, the camera still tracking laterally beside him
at matched speed. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

---

### A-4. 전력 질주

**클립 1 끝**
```
..., ending with her at full sprint, mid-stride, her body leaning hard into
the run, arms pumping fast, her ponytail streaming straight back, the camera
racing alongside her at matched speed.
```
> 그녀는 전력 질주 중이고, 몸을 앞으로 강하게 기울였고, 팔을 빠르게 흔들며, 포니테일이 뒤로 곧게 날리고, 카메라는 같은 속도로 나란히 달린다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already at full sprint,
mid-stride, her body still leaning hard into the run, arms still pumping fast,
her ponytail still streaming straight back, the camera still racing alongside
her at matched speed. The entire clip is a single uninterrupted shot with no
cuts.
[Shot 1] ...
```

💡 **포인트**: 전력 질주는 `lean(기울기)`을 꼭 쓰세요. 이게 없으면 이음매에서 상체가 벌떡 서면서 속도가 죽어 보입니다.

---

### A-5. 계단 오르기

**클립 1 끝**
```
..., ending with her climbing the steps at a steady rhythm, mid-step with her
weight shifting onto the next stair, one hand trailing along the railing, the
camera rising smoothly alongside her at the same rate.
```
> 그녀는 일정한 리듬으로 계단을 오르는 중이고, 다음 계단으로 체중을 옮기는 중이며, 한 손은 난간을 따라 미끄러지고, 카메라는 같은 속도로 함께 올라간다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already climbing the steps
at the same steady rhythm, mid-step with her weight still shifting onto the
next stair, one hand still trailing along the railing, the camera still rising
smoothly alongside her at the same rate. The entire clip is a single
uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 계단은 카메라도 같이 **올라가는 중**이어야 합니다. 카메라 높이 변화를 꼭 쓰세요.

---

### A-6. 군중 속을 헤치고 가기

**클립 1 끝**
```
..., ending with her still moving forward through the crowd at a steady pace,
mid-stride, people passing close on both sides of the frame in both
directions, the camera weaving along behind her shoulder at matched speed.
```
> 그녀는 일정한 속도로 군중 사이를 계속 헤치고 나아가는 중이고, 사람들이 화면 양옆에서 양방향으로 스쳐 지나가며, 카메라는 그녀 어깨 뒤에서 같은 속도로 누비며 따라간다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already moving forward
through the crowd at the same steady pace, mid-stride, people still passing
close on both sides of the frame in both directions, the camera still weaving
along behind her shoulder at matched speed. The entire clip is a single
uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 군중은 **양방향으로 움직인다**고 명시하세요. 한 방향만 쓰면 이음매에서 군중이 통째로 멈춥니다.

---

## 💃 B. 춤·퍼포먼스

### B-1. 느린 춤 (컨템포러리·웨이브)

**클립 1 끝**
```
..., ending with her mid-movement in a slow flowing motion, her right arm
extended and still travelling upward, her weight shifting slowly onto her back
foot, the fabric of her dress still trailing the movement, the camera circling
her slowly at the same rate.
```
> 그녀는 느리고 유려한 동작 도중이고, 오른팔이 뻗은 채 계속 위로 올라가는 중이며, 체중이 뒷발로 천천히 옮겨가고, 드레스 천이 동작을 따라 흐르고, 카메라는 같은 속도로 그녀 주위를 천천히 돈다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already mid-movement in the
same slow flowing motion, her right arm still extended and still travelling
upward, her weight still shifting slowly onto her back foot, the fabric of her
dress still trailing the movement, the camera still circling her slowly at the
same rate. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 느린 춤은 **어느 팔이 어느 방향으로 가는 중인지**를 반드시 지정하세요.

---

### B-2. 빠른 춤 (힙합·K-POP 안무)

**클립 1 끝**
```
..., ending with her holding the groove between beats, knees bent and body
still bouncing lightly on the rhythm, her hair still settling from the last
move, the camera holding a medium shot and drifting slowly to the left.
```
> 그녀는 비트 사이에서 그루브를 유지하는 중이고, 무릎을 굽힌 채 리듬에 맞춰 가볍게 바운스하고 있으며, 머리카락은 직전 동작의 여운으로 흔들리고, 카메라는 미디엄 샷으로 왼쪽으로 천천히 이동 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already holding the groove
between beats, knees still bent and her body still bouncing lightly on the
rhythm, her hair still settling from the last move, the camera still holding a
medium shot and drifting slowly to the left. The entire clip is a single
uninterrupted shot with no cuts.
[Shot 1] She stays in the groove for a moment longer. At 00:02.000, she
launches into [다음 안무 동작] ...
```

💡 **포인트**: ⚠️ **빠른 안무는 결정 포즈에서 끊지 마세요.** 반드시 **비트 사이의 바운스 구간**(그루브)에서 끊으세요. 그리고 새 동작은 2초부터 시작합니다.

---

### B-3. 회전 (턴·스핀)

**클립 1 끝**
```
..., ending with her mid-turn, rotating steadily to her left with her arms
drawn in close, her skirt still flaring outward from the spin, the camera
counter-rotating slowly around her.
```
> 그녀는 회전 도중이고, 팔을 몸에 붙인 채 왼쪽으로 일정하게 돌고 있으며, 치마가 회전 때문에 계속 퍼져 있고, 카메라는 반대 방향으로 천천히 돈다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already mid-turn, still
rotating steadily to her left with her arms still drawn in close, her skirt
still flaring outward from the spin, the camera still counter-rotating slowly
around her. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 회전은 **방향(left/right)**을 반드시 쓰세요. 안 쓰면 이음매에서 역회전합니다.

---

### B-4. 악기 연주

**클립 1 끝**
```
..., ending with his hands still moving across the keys in a steady rhythm,
his upper body swaying gently with the music, his eyes half-closed, the camera
drifting slowly along the length of the instrument.
```
> 그의 손은 일정한 리듬으로 건반 위를 계속 움직이고, 상체는 음악에 맞춰 부드럽게 흔들리며, 눈은 반쯤 감겨 있고, 카메라는 악기를 따라 천천히 이동 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; his hands are already moving across
the keys in the same steady rhythm, his upper body still swaying gently with
the music, his eyes still half-closed, the camera still drifting slowly along
the length of the instrument. The entire clip is a single uninterrupted shot
with no cuts.
[Shot 1] ...
```

---

## 🧍 C. 정적·감정

### C-1. 서서 응시하기

**클립 1 끝**
```
..., ending with her standing still and looking directly into the lens, her
breathing visible, loose strands of hair drifting across her face in the
breeze, the camera still easing slowly toward her.
```
> 그녀는 가만히 서서 렌즈를 정면으로 보고 있고, 호흡이 보이며, 흐트러진 머리카락이 바람에 얼굴을 스치고, 카메라는 여전히 그녀 쪽으로 천천히 다가가는 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already standing still and
looking directly into the lens, her breathing still visible, loose strands of
hair still drifting across her face in the breeze, the camera still easing
slowly toward her. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 인물이 멈춰 있어도 **카메라·호흡·머리카락**은 반드시 움직이게 하세요. 셋 다 멈추면 이음매에서 정지 화면처럼 보입니다.

---

### C-2. 앉아 있기

**클립 1 끝**
```
..., ending with him seated and leaning slightly forward, his hands resting
loosely around the cup, steam still rising from it, his gaze fixed on the
window, the camera drifting slowly around to his side.
```
> 그는 앉아서 약간 앞으로 기울어 있고, 손은 컵을 느슨하게 감싸고 있으며, 컵에서 김이 계속 올라오고, 시선은 창문에 고정되어 있고, 카메라는 그의 옆으로 천천히 돌아가는 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; he is already seated and leaning
slightly forward, his hands still resting loosely around the cup, steam still
rising from it, his gaze still fixed on the window, the camera still drifting
slowly around to his side. The entire clip is a single uninterrupted shot with
no cuts.
[Shot 1] ...
```

💡 **포인트**: 김·연기·촛불처럼 **계속 움직이는 작은 요소**를 하나 넣어두면 이음매가 훨씬 자연스러워집니다.

---

### C-3. 대화 중

**클립 1 끝**
```
..., ending with her mid-sentence, her mouth still moving and her hand raised
in a small explanatory gesture, the other person listening and nodding
slightly, the camera holding a two-shot and easing slowly closer.
```
> 그녀는 말하는 도중이고, 입이 계속 움직이며 한 손은 설명하는 작은 제스처로 들려 있고, 상대는 듣고 있으며 살짝 고개를 끄덕이고, 카메라는 투샷을 유지하며 천천히 다가가는 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already mid-sentence, her
mouth still moving and her hand still raised in the same small explanatory
gesture, the other person still listening and nodding slightly, the camera
still holding a two-shot and easing slowly closer. The entire clip is a single
uninterrupted shot with no cuts.
[Shot 1] She finishes the sentence and lowers her hand. At 00:02.000, [다음 대사]
```

💡 **포인트**: ⚠️ **대사가 이음매에 걸치면 발음이 겹치거나 끊깁니다.** 대사는 클립 1 안에서 끝내고, 이음매에는 **문장 끝 여운**만 두세요. 새 대사는 2초부터.

---

### C-4. 바람에 머리카락·옷 날림

**클립 1 끝**
```
..., ending with her standing in the wind, her long hair streaming to the left
and her coat rippling steadily in the same direction, her eyes narrowed
against the gust, the camera holding steady but still drifting slowly
sideways.
```
> 그녀는 바람 속에 서 있고, 긴 머리카락이 왼쪽으로 날리며 코트도 같은 방향으로 계속 펄럭이고, 바람 때문에 눈을 가늘게 뜨고 있으며, 카메라는 안정적이지만 여전히 옆으로 천천히 이동 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; she is already standing in the
wind, her long hair still streaming to the left and her coat still rippling
steadily in the same direction, her eyes still narrowed against the gust, the
camera still holding steady and drifting slowly sideways. The entire clip is a
single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 바람은 **방향**을 반드시 지정하세요. 안 쓰면 이음매에서 바람이 반대로 붑니다.

---

## 🚗 D. 탈것

### D-1. 자동차 주행 (외부에서 촬영)

**클립 1 끝**
```
..., ending with the car still travelling forward at a constant speed along
the same lane, its wheels turning steadily, light sweeping along its body
panels, the camera tracking parallel to it at matched speed.
```
> 차는 같은 차선을 따라 일정한 속도로 계속 달리는 중이고, 바퀴가 꾸준히 돌고, 빛이 차체를 훑고 지나가며, 카메라는 같은 속도로 나란히 달린다.

**클립 2 시작**
```
The clip continues the same unbroken take; the car is already travelling
forward at the same constant speed along the same lane, its wheels still
turning steadily, light still sweeping along its body panels, the camera still
tracking parallel to it at matched speed. The entire clip is a single
uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: `constant speed(일정 속도)` `same lane(같은 차선)` 두 개는 필수. 안 쓰면 이음매에서 차가 가속하거나 차선을 바꿉니다.

---

### D-2. 자동차 주행 (차 안에서)

**클립 1 끝**
```
..., ending with her hands still resting on the wheel and the road still
flowing toward the windshield at a constant speed, streetlights sweeping
rhythmically across her face, the camera holding from the passenger side and
drifting slowly toward her.
```
> 그녀의 손은 계속 핸들 위에 있고 도로는 일정한 속도로 앞유리를 향해 흘러오며, 가로등 불빛이 리듬감 있게 얼굴을 훑고, 카메라는 조수석 쪽에서 그녀 쪽으로 천천히 다가가는 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; her hands are already resting on
the wheel and the road is still flowing toward the windshield at the same
constant speed, streetlights still sweeping rhythmically across her face, the
camera still holding from the passenger side and drifting slowly toward her.
The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

---

### D-3. 자전거·오토바이

**클립 1 끝**
```
..., ending with him still riding forward at a steady speed, his body leaning
slightly into the line of travel, the wheels turning steadily and his jacket
rippling in the airflow, the camera tracking low beside the wheels at matched
speed.
```
> 그는 일정한 속도로 계속 달리는 중이고, 진행 방향으로 몸을 살짝 기울였으며, 바퀴가 꾸준히 돌고 재킷이 바람에 펄럭이고, 카메라는 바퀴 옆 낮은 위치에서 같은 속도로 따라간다.

**클립 2 시작**
```
The clip continues the same unbroken take; he is already riding forward at the
same steady speed, his body still leaning slightly into the line of travel,
the wheels still turning steadily and his jacket still rippling in the
airflow, the camera still tracking low beside the wheels at matched speed. The
entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

---

## 🎥 E. 카메라가 주인공일 때

### E-1. 인물 없이 공간만 이동

**클립 1 끝**
```
..., ending with the camera still gliding forward down the corridor at a
constant speed, the columns on both sides continuing to slide past the frame,
the light from the far end still growing brighter.
```
> 카메라는 일정한 속도로 복도를 계속 미끄러져 나아가는 중이고, 양옆의 기둥들이 계속 화면을 스쳐 지나가며, 끝쪽의 빛이 점점 밝아지는 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; the camera is already gliding
forward down the corridor at the same constant speed, the columns on both
sides still sliding past the frame, the light from the far end still growing
brighter. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 인물이 없으면 **주변 요소의 흐름**이 연결의 전부입니다. "무엇이 어느 방향으로 지나가는 중인지"를 반드시 쓰세요.

---

### E-2. 공중 드론 이동

**클립 1 끝**
```
..., ending with the camera still descending steadily while moving forward,
the rooftops below continuing to slide past beneath it, the horizon still
tilting slowly back toward level.
```
> 카메라는 전진하면서 계속 일정하게 하강하는 중이고, 아래 옥상들이 계속 밑으로 지나가며, 수평선이 천천히 수평으로 돌아오는 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; the camera is already descending
steadily while moving forward, the rooftops below still sliding past beneath
it, the horizon still tilting slowly back toward level. The entire clip is a
single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 드론은 **하강/상승 + 전진**을 따로 써야 합니다. 하나만 쓰면 나머지가 멈춥니다.

---

### E-3. 물체 주위 공전 (오빗)

**클립 1 끝**
```
..., ending with the camera still orbiting steadily clockwise around her at a
constant radius and speed, the background continuing to sweep past behind her
while she stays centred in frame.
```
> 카메라는 일정한 반경과 속도로 그녀 주위를 시계 방향으로 계속 도는 중이고, 배경이 그녀 뒤로 계속 흘러가며, 그녀는 화면 중앙에 유지된다.

**클립 2 시작**
```
The clip continues the same unbroken take; the camera is already orbiting
steadily clockwise around her at the same constant radius and speed, the
background still sweeping past behind her while she stays centred in frame.
The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: `clockwise(시계방향)` / `counter-clockwise(반시계)`를 꼭 쓰세요. 반경(`radius`)도 같이.

---

## 🌊 F. 자연·환경

### F-1. 파도

**클립 1 끝**
```
..., ending with the wave still rolling steadily toward the shore, its crest
partly broken and white foam still spreading forward across the water, the
camera drifting slowly just above the surface.
```
> 파도가 계속 해안 쪽으로 밀려오는 중이고, 마루가 부분적으로 부서져 흰 거품이 수면 위로 계속 퍼져나가며, 카메라는 수면 바로 위에서 천천히 이동 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; the wave is already rolling
steadily toward the shore, its crest still partly broken and white foam still
spreading forward across the water, the camera still drifting slowly just
above the surface. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: ⚠️ 파도가 **부서지는 순간**은 이음매에 두지 마세요. **밀려오는 중** 또는 **거품이 퍼지는 중**이 안전합니다.

---

### F-2. 비·눈

**클립 1 끝**
```
..., ending with the rain still falling steadily at the same density and
angle, water still running down the glass in the foreground, ripples still
spreading in the puddles below, the camera drifting slowly to the right.
```
> 비가 같은 밀도와 각도로 계속 내리는 중이고, 전경 유리에 물이 계속 흘러내리며, 아래 웅덩이에 파문이 계속 퍼지고, 카메라는 오른쪽으로 천천히 이동 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; the rain is already falling
steadily at the same density and angle, water still running down the glass in
the foreground, ripples still spreading in the puddles below, the camera still
drifting slowly to the right. The entire clip is a single uninterrupted shot
with no cuts.
[Shot 1] ...
```

💡 **포인트**: 비는 `density(밀도)`와 `angle(각도)`을 쓰세요. 안 쓰면 이음매에서 빗줄기 굵기가 바뀝니다.

---

### F-3. 불·연기

**클립 1 끝**
```
..., ending with the flames still burning steadily and leaning to the right in
the draught, smoke still curling upward from the same point in a continuous
column, embers still drifting slowly through the air, the camera easing
slowly closer.
```
> 불꽃이 계속 타오르며 바람 때문에 오른쪽으로 기울어 있고, 연기가 같은 지점에서 계속 위로 피어오르며, 불티가 공중을 천천히 떠다니고, 카메라는 천천히 다가가는 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; the flames are already burning
steadily and still leaning to the right in the draught, smoke still curling
upward from the same point in a continuous column, embers still drifting
slowly through the air, the camera still easing slowly closer. The entire clip
is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

---

### F-4. 구름·하늘

**클립 1 끝**
```
..., ending with the clouds still drifting slowly from left to right across
the frame, the light still shifting gradually as they pass the sun, the camera
still tilting upward at a slow constant rate.
```
> 구름이 화면을 왼쪽에서 오른쪽으로 천천히 계속 흘러가는 중이고, 구름이 해를 지나며 빛이 서서히 변하고 있으며, 카메라는 일정한 속도로 계속 위로 틸트하는 중이다.

**클립 2 시작**
```
The clip continues the same unbroken take; the clouds are already drifting
slowly from left to right across the frame, the light still shifting gradually
as they pass the sun, the camera still tilting upward at the same slow
constant rate. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

---

## 🐾 G. 동물

### G-1. 고양이·개 걷기

**클립 1 끝**
```
..., ending with the cat still padding forward at a slow steady walk,
mid-step, its tail still held up and swaying gently, its ears turned forward,
the camera tracking low alongside it at matched speed.
```
> 고양이가 느리고 일정한 걸음으로 계속 걸어가는 중이고, 꼬리를 세운 채 부드럽게 흔들고 있으며, 귀는 앞을 향해 있고, 카메라는 낮은 위치에서 같은 속도로 따라간다.

**클립 2 시작**
```
The clip continues the same unbroken take; the cat is already padding forward
at the same slow steady walk, mid-step, its tail still held up and swaying
gently, its ears still turned forward, the camera still tracking low alongside
it at matched speed. The entire clip is a single uninterrupted shot with no
cuts.
[Shot 1] ...
```

💡 **포인트**: 동물은 **꼬리·귀** 같은 부속 부위를 반드시 지정하세요. 이 부분이 이음매에서 가장 잘 튑니다.

---

### G-2. 새 날기

**클립 1 끝**
```
..., ending with the bird still gliding forward on outstretched wings without
flapping, holding a steady altitude and heading, the camera tracking beside it
at matched speed against the open sky.
```
> 새가 날개를 편 채 퍼덕이지 않고 계속 활공하는 중이고, 고도와 방향을 일정하게 유지하며, 카메라는 열린 하늘을 배경으로 같은 속도로 옆에서 따라간다.

**클립 2 시작**
```
The clip continues the same unbroken take; the bird is already gliding forward
on outstretched wings without flapping, still holding the same steady altitude
and heading, the camera still tracking beside it at matched speed against the
open sky. The entire clip is a single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: ⚠️ **날갯짓하는 순간**은 이음매에 두지 마세요. **활공(gliding, 날개 편 채)**이 훨씬 안전합니다.

---

## 🌀 H. 샷을 바꾸고 싶을 때 (전환용)

> 이음매에서는 원칙적으로 컷할 수 없습니다. 하지만 **화면에 정보를 거의 남기지 않으면** 다음 클립이 자유로워져서 **컷처럼 보이게** 만들 수 있습니다.

### H-1. 휩팬 전환 (가장 범용)

**클립 1 끝**
```
..., the camera whips hard to the right, the frame dissolving into heavy
horizontal motion blur as everything smears past, ending mid-whip at maximum
blur with no stable detail anywhere in frame.
```
> 카메라가 오른쪽으로 세게 휙 돌면서 화면이 강한 수평 모션블러로 뭉개지고, 모든 것이 번져 지나가며, 최대 블러 상태에서 화면에 선명한 것이 하나도 없는 채로 끝난다.

**클립 2 시작**
```
The clip opens inside the hard horizontal motion blur the camera is already
carrying, which decelerates over the first second and resolves into a
completely new camera setup. The entire clip is a single uninterrupted shot
with no further cuts.
[Shot 1] The blur settles into [새로운 장소], the camera now [새 앵글/사이즈]
as [피사체가 이미 하고 있는 동작]. At 00:02.000, ...
```
> 카메라가 이미 갖고 있는 강한 수평 블러 안에서 클립이 시작되고, 1초에 걸쳐 감속하며 완전히 새로운 카메라 세팅으로 정리된다. 블러가 [새 장소]로 정리되고, 카메라는 이제 [새 앵글]이며 [피사체 동작]이 이미 진행 중이다.

⚠️ **주의**: 블러는 **클립 끝 1.7초 전부터** 시작해서 끝까지 유지되어야 합니다. (8초 클립이면 6.3초부터) 너무 늦게 시작하면 겹침 구간에 아직 선명한 화면이 남아 소용없습니다.

---

### H-2. 전경 가림 전환 (장소 이동에 강함)

**클립 1 끝**
```
..., the camera pushes past a broad column that sweeps in from the left and
completely fills the frame, ending with the lens fully covered by its dark
surface and no space visible beyond it.
```
> 카메라가 왼쪽에서 들어온 넓은 기둥을 스쳐 지나가며 화면이 완전히 가려지고, 렌즈가 그 어두운 표면으로 완전히 덮인 채 너머 공간이 전혀 안 보이는 상태로 끝난다.

**클립 2 시작**
```
The clip opens with the frame still filled by the dark surface the camera is
pressed against, which clears off the left edge within the first second to
reveal [완전히 새로운 장소].
[Shot 1] ...
```

---

### H-3. 광량 폭발 전환 (밝은 실외)

**클립 1 끝**
```
..., the camera tilts into the direct light source, the frame blowing out to
near-white as the flare swallows the image, ending fully overexposed with no
readable detail.
```
> 카메라가 직광 쪽으로 틸트하면서 화면이 거의 흰색으로 날아가고, 플레어가 이미지를 삼키며, 알아볼 수 있는 디테일이 전혀 없는 완전 노출 과다 상태로 끝난다.

**클립 2 시작**
```
The clip opens fully overexposed in the same white blowout, the exposure
recovering over the first second into [새로운 장소].
[Shot 1] ...
```

---

### H-4. 암전 전환 (실내·야간)

**클립 1 끝**
```
..., the camera pushes into the deep shadow beneath the structure, the frame
falling to near-black, ending with almost no detail visible.
```
> 카메라가 구조물 아래 짙은 그림자 속으로 밀고 들어가면서 화면이 거의 검게 떨어지고, 보이는 디테일이 거의 없는 상태로 끝난다.

**클립 2 시작**
```
The clip opens in near-blackness, light returning over the first second as the
camera emerges into [새로운 장소].
[Shot 1] ...
```

---

## ⏱ I. 속도 조절

### I-1. 슬로모션 유지

**클립 1 끝**
```
..., the action drops into extreme slow motion, [피사체] moving slowly through
[동작], [부속 요소 — 머리카락/옷/물방울] trailing slowly behind the movement,
ending mid-motion at the same slow speed.
```
> 동작이 극단적 슬로모션으로 떨어지고, [피사체]가 [동작]을 천천히 수행하며, [머리카락/옷/물방울]이 동작을 따라 천천히 흐르고, 같은 느린 속도로 동작 도중에 끝난다.

**클립 2 시작**
```
The clip continues the same unbroken take in the same extreme slow motion;
[피사체] is already moving slowly through [동작], [부속 요소] still trailing
slowly behind the movement, at the same slow speed. The entire clip is a
single uninterrupted shot with no cuts.
[Shot 1] ...
```

💡 **포인트**: 슬로모션은 **이음매 최강의 안전장치**입니다. 어려운 동작이 이음매에 걸릴 것 같으면 그 구간만 슬로모션으로 만드세요.

---

### I-2. 슬로모션 → 정속 복귀

**클립 2 시작 (슬로모션을 물려받아 2초에 정속 복귀)**
```
The clip continues the same unbroken take in the same extreme slow motion;
[클립 1 끝 상태 복사]. The entire clip is a single uninterrupted shot with no
cuts.
[Shot 1] The slow motion holds a moment longer. At 00:02.000, the action snaps
back to full speed as [새로운 전개] ...
```
> 슬로모션이 잠시 더 유지된다. 2초에 동작이 정속으로 확 돌아오면서 [새 전개]가 시작된다.

💡 **포인트**: 이 스피드램프는 **기술적 우회책인데 연출로 읽힙니다.** 액션·뮤비 문법 그대로예요.

---

# 6. VFX·소품·조연 처리법

이음매에서 가장 많이 실수하는 부분입니다.

## 6-1. 화면에 있는 **모든 것**을 양쪽에 써야 합니다

주인공만 쓰면 나머지가 이음매에서 사라졌다 나타납니다.

| 요소 | 반드시 써야 할 것 |
|---|---|
| **조연·상대 인물** | 위치 + 자세 + 하고 있는 동작 |
| **VFX (빛·궤적·파티클)** | 형태 + 위치 + **소멸 방향** |
| **소품 (컵·무기·가방)** | 어느 손에 + 어떤 각도로 |
| **연기·김·먼지** | 어느 방향으로 흐르는 중인지 |
| **군중** | 몇 명이 어느 방향으로 |

## 6-2. VFX는 "소멸 방향"까지 지정하세요

```
❌ the glowing trail fades.
   (빛 궤적이 사라진다) → 통째로 깜빡 꺼짐

✅ the glowing trail thins and dissipates from its oldest end.
   (빛 궤적이 가장 오래된 끝부터 가늘어지며 흩어진다) → 자연스럽게 소멸
```

## 6-3. 조연 심어두기

클립 1 끝에 조연이 없다가 클립 2에서 갑자기 나오면 튀어나온 것처럼 보입니다. **클립 1 꼬리에 미리 심어두세요.**

```
클립 1 끝: ..., her friend still standing two paces behind her and looking
           in the same direction.
클립 2 시작: ..., her friend still standing two paces behind her and still
             looking in the same direction.
```

---

# 7. 초보가 자주 하는 실수 TOP 10

| # | 실수 | 결과 | 해결 |
|---|---|---|---|
| 1 | `[Shot 2]`를 씀 | 2초마다 컷이 생김 | `[Shot 1]` 하나만, `At 00:02.000,`로 이어쓰기 |
| 2 | `begins to ~`로 시작 | 이음매에서 동작이 리셋됨 | `is already ~ing`로 |
| 3 | 클립을 멈춘 상태로 끝냄 | 다음 클립도 멈춘 채 시작 | 항상 움직이는 상태로 끝내기 |
| 4 | 이음매 문장을 다르게 씀 | 화면이 튐 | **복사**하고 시제만 변환 |
| 5 | 빠른 동작이 이음매에 걸침 | 뭉개지거나 두 번 반복됨 | 클립 끝 1.7초 전에 완결 |
| 6 | VFX를 한쪽에만 씀 | 이펙트가 깜빡임 | 양쪽에 동일하게 |
| 7 | 조연을 클립 2에서만 씀 | 사람이 튀어나옴 | 클립 1 꼬리에 미리 심기 |
| 8 | 방향을 안 씀 | 이음매에서 역방향 | left/right/clockwise 명시 |
| 9 | 실내↔실외가 이음매에서 바뀜 | 공간이 녹아내림 | 실제 문·통로를 통과하는 동선으로 |
| 10 | 대사가 이음매에 걸침 | 발음이 겹침 | 대사는 클립 안에서 완결 |

---

# 8. AI에게 시킬 때 쓰는 지침 프롬프트

> 챗봇(ChatGPT, Claude 등)에게 프롬프트 작성을 시킬 때 **아래를 통째로 복사해서** 먼저 붙여넣으세요.

## 8-1. 기본 지침 (복붙용)

```
당신은 MiniMax H3 ONE STUDIO의 One-Take(latent) 모드용 영상 프롬프트 작성
전문가입니다. 아래 규칙을 반드시 지켜서 작성하세요.

[시스템 구조]
- 각 클립은 정확히 [클립 길이]초입니다. (사용자가 지정한 값을 쓰세요)
- 클립과 클립 사이는 39프레임(1.625초)이 겹칩니다.
- 클립 N+1의 첫 1.625초는 클립 N의 마지막 1.625초를 그대로 재현합니다.
- 따라서 클립 N+1의 시작은 "새 내용"이 아니라 클립 N 끝 상태의 복사본입니다.
- 클립 하나가 실제로 늘려주는 시간은 ([클립 길이] − 1.625)초입니다.
- 겹침 1.625초는 클립 길이와 무관하게 항상 고정입니다.

[절대 규칙]
1. 각 클립에 [Shot 1] 하나만 사용하세요. [Shot 2] 이상은 "컷"을 의미하므로
   절대 쓰지 마세요.
2. 2초 지점의 전개는 같은 문단 안에서 "At 00:02.000, ..."으로 이어 쓰세요.
3. 각 클립의 마지막은 반드시 "그 순간의 상태"를 구체적으로 명시하며
   끝내세요. (동작 서술로 끝내지 말고, 마지막 프레임 정지화면을 묘사하듯)
4. 다음 클립의 첫 문장은 그 상태의 명사구를 글자 그대로 복사하고, 동사만
   "is already ~ing" / "still"로 바꾸세요. 절대 다른 표현으로 바꾸지 마세요.
5. 되돌릴 수 없는 빠른 동작(타격, 점프, 던지기, 문 열기)은 클립 끝 1.7초
   이전에 완결시키세요. 이음매에는 느리고 지속 가능한 동작만 두세요.
6. 클립은 정지 상태가 아니라 "움직이는 벡터" 상태로 끝내세요.
7. 화면에 있는 모든 요소(조연, VFX, 소품, 연기, 군중)의 상태를 양쪽 클립에
   동일한 문구로 쓰세요.
8. 방향(left/right/clockwise)과 속도(same steady pace 등)를 반드시
   명시하세요.
9. 각 클립 서두에 다음 문장을 넣으세요:
   "The entire clip is a single uninterrupted shot with no cuts."

[출력 형식]
각 클립마다:
- 클립 번호와 제목
- 영어 프롬프트 (detailed_description)
- 한글 요약 3줄

[작성 전 확인]
클립 수와 총 길이를 먼저 계산해서 알려주세요.
(총 길이 = 클립길이 + (클립수 - 1) × (클립길이 - 1.625)초)
```

## 8-2. 요청 템플릿 (위 지침 다음에 붙여넣기)

```
[내가 만들려는 것]
- 주제/컨셉:
- 클립 1개 길이 (내 시스템 스윗스팟):   ← 예: 8초 / 15초 / 30초
- 총 길이(또는 클립 수):
- 주인공:
- 장소:
- 스타일(실사/애니/3D 등):
- 내레이션 유무:
- 음악 유무:

[클립별 하고 싶은 것]
클립 1:
클립 2:
클립 3:
...

위 지침에 맞게 작성해주세요.
```

## 8-3. 이음매만 고칠 때 (복붙용)

```
아래 두 클립의 이음매를 수정해주세요.

[클립 1의 마지막 문장]
(여기 붙여넣기)

[클립 2의 시작 문장]
(여기 붙여넣기)

규칙:
- 클립 1의 끝에 "그 순간의 상태"를 명시하는 문장을 추가
- 클립 2의 시작을 클립 1 끝 상태의 복사본으로 변경
  (명사구는 그대로, 동사만 is already ~ing / still로)
- 화면의 모든 요소(인물, VFX, 소품, 조연)를 양쪽에 동일하게
- 방향과 속도 명시
- 영어 원문 + 한글 요약 함께 출력
```

---

# 9. 최종 체크리스트

돌리기 전에 클립마다 확인하세요.

### 문법
- [ ] `[Shot 1]`만 있고 `[Shot 2]`는 없는가
- [ ] 2초 전개가 `At 00:02.000,`으로 같은 문단에 있는가
- [ ] `The entire clip is a single uninterrupted shot with no cuts.` 가 있는가

### 이음매
- [ ] 클립 1의 끝에 **상태 묘사**가 있는가
- [ ] 클립 2의 시작이 그 상태의 **복사본**인가 (표현을 안 바꿨는가)
- [ ] `is already ~ing` / `still`을 썼는가
- [ ] 빠른 동작이 **클립 끝 1.7초 전에** 끝나는가

### 요소
- [ ] 조연·상대의 위치와 자세를 양쪽에 썼는가
- [ ] VFX를 양쪽에 썼는가 (+ 소멸 방향)
- [ ] 소품·연기·군중을 양쪽에 썼는가

### 방향·속도
- [ ] 이동 방향을 썼는가 (left/right/forward)
- [ ] 회전 방향을 썼는가 (clockwise 등)
- [ ] 속도를 썼는가 (same steady pace 등)
- [ ] 카메라도 계속 움직이는가

### 끝맺음
- [ ] 클립이 **멈춤이 아니라 움직임**으로 끝나는가

### 설정
- [ ] Continuity = **One-Take (latent)**
- [ ] Auto-Stitch **켜짐**
- [ ] 클립마다 대사가 다르면 **오디오 락 꺼짐**

### 실행 중
- [ ] 브라우저 탭을 **닫지 않기** (최소화는 OK)
- [ ] 컴퓨터 **절전모드 끄기**
- [ ] 중간에 멈추면 → 완료된 클립 체크 해제하고 나머지만 재실행

---

# 10. 부록

## 10-1. 길이 계산표

**총 길이 = 클립 길이 + (클립수 − 1) × (클립 길이 − 1.625)**

겹침 1.625초는 고정이므로, 클립 하나가 늘려주는 시간은 **클립 길이 − 1.625초**입니다.

### 클립 길이별 총 영상 길이 (초)

| 클립 수 | 8초 클립 | 10초 | 12초 | 15초 | 20초 | 30초 |
|---|---|---|---|---|---|---|
| 2 | 14.4 | 18.4 | 22.4 | 28.4 | 38.4 | 58.4 |
| 3 | 20.8 | 26.8 | 32.8 | 41.8 | 56.8 | 86.8 |
| 4 | 27.1 | 35.1 | 43.1 | 55.1 | 75.1 | 115.1 |
| 5 | 33.5 | 43.5 | 53.5 | 68.5 | 93.5 | 143.5 |
| 6 | 39.9 | 51.9 | 63.9 | 81.9 | 111.9 | 171.9 |
| 7 | 46.3 | 60.3 | 74.3 | 95.3 | 130.3 | 200.3 |
| 8 | 52.6 | 68.6 | 84.6 | 108.6 | 148.6 | 228.6 |
| 9 | **59.0** | 77.0 | 95.0 | 122.0 | 167.0 | 257.0 |
| 10 | 65.4 | 85.4 | 105.4 | 135.4 | 185.4 | 285.4 |

### 클립이 길수록 효율이 좋습니다

겹침 1.625초는 **어떤 길이에서도 똑같이 버려지기** 때문입니다.

| 클립 길이 | 새로 늘어나는 시간 | 효율 |
|---|---|---|
| 8초 | 6.375초 | 80% |
| 10초 | 8.375초 | 84% |
| 12초 | 10.375초 | 86% |
| 15초 | 13.375초 | 89% |
| 20초 | 18.375초 | 92% |
| 30초 | 28.375초 | 95% |

**목표 길이에서 클립 수 구하기**
`클립 수 = (목표초 − 클립길이) ÷ (클립길이 − 1.625) + 1` (올림)

> 📌 **참고**: H3는 프레임 수가 `17k+5` 격자에만 떨어집니다(24fps 기준). 그래서 원하는 초를 딱 맞추지 못할 수 있는데, ONE STUDIO가 가장 가까운 값으로 잡아줍니다. 8초(192프레임)는 격자에 정확히 떨어지는 값이라 다루기 편합니다.

## 10-2. 이벤트가 최종 영상에서 등장하는 시각

**클립 N의 2초 지점 = 최종 (N−1) × (클립 길이 − 1.625) + 2.0초**

| 클립 | 8초 클립 | 15초 클립 | 30초 클립 |
|---|---|---|---|
| 1 | 2.0초 | 2.0초 | 2.0초 |
| 2 | 8.4초 | 15.4초 | 30.4초 |
| 3 | 14.8초 | 28.8초 | 58.8초 |
| 4 | 21.1초 | 42.1초 | 87.1초 |
| 5 | 27.5초 | 55.5초 | 115.5초 |
| 6 | 33.9초 | 68.9초 | 143.9초 |
| 7 | 40.3초 | 82.3초 | 172.3초 |
| 8 | 46.6초 | 95.6초 | 200.6초 |
| 9 | 53.0초 | 109.0초 | 229.0초 |
| 10 | 59.4초 | 122.4초 | 257.4초 |

내레이션이나 주요 사건이 **일정한 간격**으로 떨어집니다. 대본 리듬 짤 때 이 표를 먼저 만드세요.

### ⭐ 클립이 길면 한 클립에 사건을 여러 개 넣으세요

8초 클립은 새 전개 구간이 4.3초라 사건 하나가 적당하지만, 15초 클립은 11.3초나 되므로 하나만 넣으면 늘어집니다.

```
[Shot 1] [이음매 상태 복사] At 00:02.000, [첫 번째 사건] ...
At 00:06.500, [두 번째 사건] ... At 00:10.000, [세 번째 사건] ...
ending with [움직이는 상태].
```

⚠️ 단, **마지막 사건도 클립 끝 1.7초 전에는 끝나야 합니다.**

## 10-3. 자주 쓰는 영어 표현 사전

### 이어짐 표현
| 영어 | 한글 |
|---|---|
| `is already ~ing` | 이미 ~하는 중이다 |
| `still` | 여전히 |
| `at the same steady pace` | 같은 일정한 속도로 |
| `mid-stride` | 걸음 도중에 |
| `mid-step` | 발 딛는 도중에 |
| `mid-movement` | 동작 도중에 |
| `mid-turn` | 회전 도중에 |
| `carrying the same momentum` | 같은 관성을 유지한 채 |

### 끝맺음 표현
| 영어 | 한글 |
|---|---|
| `ending with ~` | ~한 상태로 끝난다 |
| `still drifting toward ~` | 여전히 ~쪽으로 흘러가는 중 |
| `still travelling forward` | 여전히 앞으로 나아가는 중 |
| `primed to continue` | 이어갈 준비가 된 상태로 |

### 카메라 움직임
| 영어 | 한글 |
|---|---|
| `tracking alongside` | 옆에서 나란히 따라감 |
| `pushing in` | 다가감 |
| `pulling back` | 물러남 |
| `orbiting around` | 주위를 돎 |
| `tilting up/down` | 위/아래로 각도 변경 |
| `rising / descending` | 상승 / 하강 |
| `drifting` | 천천히 흘러감 |
| `whip pan` | 빠르게 휙 돌림 |
| `lateral pass` | 옆으로 스쳐 지나감 |

### 프레임 사이즈
| 영어 | 한글 | 화면 범위 |
|---|---|---|
| `close-up` | 클로즈업 | 얼굴 |
| `medium close-up` | 미디엄 클로즈업 | 가슴~머리 |
| `medium shot` | 미디엄 샷 | 허리~머리 |
| `knee shot` | 니 샷 | 무릎~머리 |
| `full shot` | 풀 샷 | 전신 |
| `wide shot` | 와이드 샷 | 전신 + 공간 |

## 10-4. 타이포그래피 효과 사전

> 영상 안에 **글자**를 넣고 움직일 때 쓰는 표현입니다.

### 먼저 — 영어 문장 만드는 요령

"화면 가득 찬 큰 글씨가 왼쪽에서 들어왔다가 잠깐 있다가 오른쪽으로 나간다"를 영어로 쓰면:

```
❌ huge size text slide left in and moment then right slide out

✅ Oversized text fills the entire frame, sliding in from the left edge,
   holding briefly at centre, then sliding out past the right edge.
```

**고치는 요령 3가지**

| 한국어식 | 영어식 | 왜 |
|---|---|---|
| `slide left in` | `sliding in **from the left**` | "왼쪽**에서**" = from the left |
| `and moment` | `holding briefly` | "잠깐 있다"도 **동작**으로 씀 |
| `right slide out` | `sliding out **past the right edge**` | "나간다" = 화면 밖으로 |

💡 동작을 **`-ing`로 이어 붙이면** 한 문장에 여러 동작을 자연스럽게 담을 수 있습니다.
`A, doing X, doing Y, then doing Z.` 형태를 외워두세요.

---

### ① 등장 (Entrance)

| 영어 | 한글 |
|---|---|
| `sliding in from the left / right / top / bottom` | 좌/우/위/아래에서 밀려 들어옴 |
| `fading in` | 서서히 나타남 |
| `scaling up from nothing` | 점에서 커지며 등장 |
| `popping into frame` | 툭 튀어나옴 |
| `appearing one letter at a time` | 한 글자씩 나타남 (타자기) |
| `assembling from scattered fragments` | 흩어진 조각이 모여 완성됨 |
| `resolving out of a blur` | 흐릿하다가 또렷해짐 |
| `revealed by a wipe passing across it` | 와이프에 쓸리며 드러남 |
| `dropping in from above and settling` | 위에서 떨어져 자리잡음 |
| `rotating into place` | 회전하며 자리잡음 |
| `flipping into view` | 뒤집히며 나타남 |
| `glitching into existence` | 지직거리며 나타남 |
| `rising up from below the frame` | 화면 아래에서 솟아오름 |
| `stamping into place with a hard impact` | 쾅 찍히듯 나타남 |

### ② 유지 (Hold)

| 영어 | 한글 |
|---|---|
| `holding at centre` | 중앙에 머무름 |
| `holding briefly` | 잠깐 머무름 |
| `floating slowly in place` | 제자리에서 천천히 떠 있음 |
| `drifting slowly to the left` | 천천히 왼쪽으로 흐름 |
| `pulsing gently` | 부드럽게 커졌다 작아짐 |
| `a bright sweep travelling across the letters` | 빛이 글자를 훑고 지나감 |
| `shimmering` | 반짝임 |
| `vibrating with a fine jitter` | 미세하게 떨림 |
| `tracking with the camera in parallax` | 카메라 따라 시차 이동 |
| `slowly rotating in place` | 제자리에서 천천히 회전 |

### ③ 퇴장 (Exit)

| 영어 | 한글 |
|---|---|
| `sliding out past the right edge` | 오른쪽 화면 밖으로 나감 |
| `fading out` | 서서히 사라짐 |
| `scaling down to nothing` | 작아지며 사라짐 |
| `shattering into fragments` | 조각나며 깨짐 |
| `dissolving into particles` | 입자로 흩어짐 |
| `glitching out` | 지직거리며 사라짐 |
| `wiped away from left to right` | 좌→우로 쓸려 사라짐 |
| `collapsing letter by letter` | 글자별로 무너짐 |
| `blowing apart in the wind` | 바람에 흩날려 사라짐 |
| `sinking below the frame` | 화면 아래로 가라앉음 |

### ④ 크기·위치

| 영어 | 한글 |
|---|---|
| `oversized text filling the entire frame` | 화면 가득 찬 초대형 글자 |
| `full-frame text` | 화면 전체 글자 |
| `large text across the lower third` | 하단 1/3에 큰 글자 |
| `small caption text at the bottom` | 하단 작은 자막 |
| `centred in frame` | 화면 중앙에 |
| `anchored to the left edge` | 왼쪽 끝에 붙어서 |
| `stacked on three lines` | 세 줄로 쌓여서 |

### ⑤ 평면 vs 입체 ⭐ 중요

원테이크에서는 이 구분이 결정적입니다. **입체 글자는 인물·공간과 상호작용**합니다.

| 영어 | 한글 |
|---|---|
| `flat text overlaid on the image` | 화면에 얹힌 **평면** 글자 (자막처럼) |
| `three-dimensional text standing in the space` | 공간에 서 있는 **입체** 글자 |
| `passing behind her` | 인물 **뒤로** 지나감 |
| `passing in front of her` | 인물 **앞으로** 지나감 |
| `projected onto the wall` | 벽에 투사됨 |
| `reflected in the polished floor` | 광택 바닥에 반사됨 |
| `catching the scene's lighting` | 장면의 조명을 받음 |
| `casting a soft shadow on the floor` | 바닥에 그림자를 드리움 |

💡 **입체감을 확실히 주는 문장**:
`some segments pass behind her and others sweep in front of her, establishing true depth rather than a flat overlay.`
> 일부 조각은 그녀 뒤로, 일부는 앞으로 지나가며 평면 오버레이가 아닌 진짜 깊이감을 만든다.

### ⑥ 질감·스타일

| 영어 | 한글 |
|---|---|
| `glowing neon text` | 빛나는 네온 글자 |
| `polished chrome lettering` | 광택 크롬 글자 |
| `luminous geometric letterforms` | 발광하는 기하학적 글자 |
| `outlined text with no fill` | 테두리만 있는 글자 |
| `solid white sans-serif text` | 흰색 산세리프 글자 |
| `transparent glass letters` | 투명 유리 글자 |
| `rough hand-drawn lettering` | 거친 손글씨 |
| `heavy bold condensed type` | 굵고 좁은 서체 |

### ⑦ 바로 쓰는 예문 5개

**a. 화면 가득 찬 텍스트가 좌→우로 통과**
```
Oversized white text fills the entire frame, sliding in from the left edge,
holding briefly at centre, then sliding out past the right edge.
```
> 화면 가득 찬 흰 대형 글자가 왼쪽에서 들어와 중앙에 잠깐 머문 뒤 오른쪽 밖으로 나간다.

**b. 조각이 모여 제목 완성 + 빛 스윕**
```
Luminous geometric fragments drift through the space and assemble into the
title, locking into place as a bright silver sweep travels across every
letter in sequence.
```
> 발광하는 기하학적 조각들이 공간을 떠다니다 제목으로 모여 자리를 잡고, 밝은 은빛이 모든 글자를 차례로 훑고 지나간다.

**c. 한 글자씩 타자기**
```
The text appears one letter at a time across the lower third, each character
landing with a soft click, the completed line holding steady.
```
> 하단 1/3에 글자가 하나씩 나타나고, 각 글자가 부드러운 클릭음과 함께 찍히며, 완성된 줄이 그대로 유지된다.

**d. 인물 주위를 도는 입체 글자**
```
Three-dimensional text stands in the space around her, some letters passing
behind her and others sweeping in front as the camera orbits, catching the
scene's lighting on their metallic surfaces.
```
> 입체 글자가 그녀 주위 공간에 서 있고, 카메라가 도는 동안 일부 글자는 뒤로 일부는 앞으로 지나가며, 금속 표면에 장면의 조명이 반사된다.

**e. 글자가 깨지며 퇴장**
```
The text holds for a beat, then shatters into fragments that scatter outward
past the edges of the frame and fade.
```
> 글자가 한 박자 유지되다가 조각으로 부서져 화면 밖으로 흩어지며 사라진다.

---

### ⑧ 그래픽 필드·배경

미니멀한 그래픽 배경 위에 글자를 올릴 때 쓰는 표현입니다.

| 영어 | 한글 |
|---|---|
| `pure white graphic field` | 순백 그래픽 배경 |
| `black screen` | 검은 화면 |
| `negative space` | 여백 (비어 있는 공간) |
| `emerging from negative space` | 여백에서 인물이 나타남 |
| `gold circular geometry behind it` | 뒤쪽의 금색 원형 도형 |
| `one enormous black circle` | 거대한 검은 원 하나 |
| `the background divides into four aligned panels` | 배경이 정렬된 네 패널로 나뉨 |
| `the frame splits into two graphic halves` | 화면이 두 그래픽 반쪽으로 갈라짐 |
| `technical interface lines construct a silhouette` | 인터페이스 선이 실루엣을 그림 |
| `UI panels snap into position` | UI 패널이 착 자리잡음 |
| `technical boxes lock onto [대상]` | 기술 박스가 [대상]에 락온됨 |
| `a minimal hero composition` | 미니멀한 히어로 구도 |
| `a final white identity screen` | 마지막 흰색 아이덴티티 화면 |

### ⑨ 타이포와 인물의 관계 ⭐ 실전 최다 사용

**글자와 인물 중 누가 앞에 있는지**를 지정하는 표현입니다. 이게 없으면 항상 글자가 인물을 덮어버립니다.

| 영어 | 한글 |
|---|---|
| `remaining readable before she crosses in front of it` | 인물이 앞을 지나기 전까지 읽힘 |
| `she crosses in front of the typography` | 인물이 글자 **앞을** 지나감 |
| `she moves through the typography toward camera` | 글자 사이를 뚫고 카메라 쪽으로 옴 |
| `the typography appears cleanly beside her` | 글자가 인물 **옆에** 깔끔하게 나타남 |
| `giant typography appears behind her` | 거대한 글자가 인물 **뒤에** 나타남 |
| `huge typography spans the panels` | 거대한 글자가 여러 패널에 걸침 |
| `passing through one letter reveals [X]` | 글자 하나를 통과하니 [X]가 드러남 |
| `she disappears behind the typography and reappears` | 글자 뒤로 사라졌다 다시 나타남 |

💡 `remaining readable before she crosses in front of it`은 **글자를 언제까지 읽히게 할지**를 정하는 표현이라 특히 유용합니다.

### ⑩ 타이포 구조물 (글자가 공간이 될 때)

| 영어 | 한글 |
|---|---|
| `a tunnel made entirely from repeating [WORD] typography` | [단어]가 반복되어 만들어진 터널 |
| `the camera flies through the typography tunnel` | 카메라가 글자 터널을 통과 |
| `the tunnel typography changes to [WORD]` | 터널의 글자가 [단어]로 바뀜 |
| `the typography is pushed outward from camera` | 글자가 카메라 바깥으로 밀려남 |
| `the tunnel collapses into one final giant word` | 터널이 하나의 거대한 단어로 무너져 모임 |
| `barcode fragments assemble the word [WORD]` | 바코드 조각이 [단어]를 조립 |
| `a thin white scanner sweeps vertically` | 얇은 흰 스캐너가 수직으로 훑음 |
| `the scanner reveals it section by section` | 스캐너가 구역별로 드러냄 |
| `small designation: [WORD]` | 작은 지정 텍스트: [단어] |
| `huge condensed typography slams into frame` | 굵고 좁은 대형 글자가 쾅 박힘 |

### ⚠️ 타이포가 이음매에 걸릴 때

**글자도 화면의 요소입니다.** 양쪽 클립에 똑같이 써야 합니다. 안 그러면 이음매에서 글자가 깜빡이거나 위치가 튑니다.

**🟢 이음매에 둬도 되는 텍스트 상태**
- 화면에 떠서 미세하게 흔들리는 중 (`floating slowly in place`)
- 천천히 흐르는 중 (`drifting slowly to the left`)
- 빛이 훑고 지나가는 중 (`a bright sweep travelling across`)
- 조각이 천천히 모이는 중 (`fragments slowly assembling`)

**🔴 이음매에 두면 안 되는 것**
- 빠른 슬라이드 인/아웃 순간
- 깨지는 순간 (`shattering`)
- 툭 튀어나오는 순간 (`popping in`)
- 글자가 완성되는 정확한 타이밍

**예시 — 텍스트를 이음매로 넘기기**

*클립 1 끝*
```
..., ending with the title holding at centre of frame, floating slowly in
place, a faint silver sweep still travelling from left to right across the
letters.
```
> 제목이 화면 중앙에 유지된 채 제자리에서 천천히 떠 있고, 옅은 은빛이 글자를 왼쪽에서 오른쪽으로 훑고 지나가는 중인 상태로 끝난다.

*클립 2 시작*
```
The clip continues the same unbroken take; the title is already holding at
centre of frame, still floating slowly in place, the faint silver sweep still
travelling from left to right across the letters. The entire clip is a single
uninterrupted shot with no cuts.
[Shot 1] The sweep clears the last letter. At 00:02.000, [다음 전개]
```

---

## 10-5. 화면 전환 효과 사전

> ⚠️ **먼저 알아야 할 것**: 원테이크(One-Take) 모드에서는 **이음매에서 컷할 수 없습니다.**
> 전환 효과는 **① 클립 한가운데**에 넣거나, **② 편집기에서** 처리하세요.
> 이음매에서 컷처럼 보이게 하는 방법은 [5장 H절](#-h-샷을-바꾸고-싶을-때-전환용)에 있습니다.

### 어디서 처리할지 판단표

| 전환 효과 | AI 생성 | 편집기 | 추천 |
|---|---|---|---|
| 휩팬 (Whip pan) | ◎ | △ | **AI** |
| 전경 가림 (Foreground wipe) | ◎ | ✗ | **AI** |
| 광량 폭발 (Light blowout) | ◎ | ○ | **AI** |
| 암전 통과 (Into darkness) | ◎ | ○ | **AI** |
| 문·통로 통과 | ◎ | ✗ | **AI** |
| 물체 통과 (Through object) | ○ | ✗ | **AI** |
| 페이드 인/아웃 | ○ | ◎ | 편집기 |
| 디졸브 (Cross dissolve) | △ | ◎ | **편집기** |
| 스핀 전환 | △ | ◎ | **편집기** |
| 줌 블러 전환 | ○ | ◎ | 편집기 |
| 글리치 전환 | ○ | ◎ | 편집기 |
| 모자이크 / 픽셀화 | ✗ | ◎ | **편집기** |
| 타일 / 블록 분할 | ✗ | ◎ | **편집기** |
| 라이트 릭 / 필름 번 | ○ | ◎ | 편집기 |

`◎ 잘 됨` `○ 가능` `△ 불안정` `✗ 거의 안 됨`

💡 **핵심 판단 기준**: **카메라와 물리로 설명되는 전환은 AI가 잘합니다.** 반대로 픽셀을 직접 조작하는 효과(모자이크, 타일, 디졸브)는 편집기가 훨씬 정확하고 빠릅니다.

---

### ① 카메라·물리 기반 (AI가 잘함) ⭐ 권장

| 영어 | 한글 |
|---|---|
| `whipping hard to the right into heavy motion blur` | 오른쪽으로 세게 휙 돌려 강한 블러 |
| `a column sweeps in and completely fills the frame` | 기둥이 들어와 화면을 완전히 가림 |
| `passing behind a foreground figure` | 전경 인물 뒤로 지나감 |
| `tilting into the light until the frame blows out to white` | 빛 쪽으로 틸트해 화면이 하얗게 날아감 |
| `pushing into deep shadow until the frame falls to black` | 짙은 그림자로 밀고 들어가 화면이 검어짐 |
| `flying through the open doorway without slowing` | 열린 문을 속도 유지한 채 통과 |
| `passing through the narrow gap between two walls` | 두 벽 사이 좁은 틈을 통과 |
| `diving down through the surface of the water` | 수면 아래로 잠수하며 통과 |
| `pushing through a cloud of smoke` | 연기 구름을 뚫고 지나감 |
| `swinging around a corner into a new space` | 모퉁이를 돌아 새 공간으로 |

### ② 광학·편집 기반 (편집기 권장)

써보고 싶으면 아래 문장을 쓰되, **결과가 불안정하면 편집기로 옮기세요.**

| 영어 | 한글 | 안정성 |
|---|---|---|
| `fading to black` | 검게 페이드 아웃 | ○ |
| `fading in from black` | 검은 화면에서 페이드 인 | ○ |
| `fading to white` | 하얗게 페이드 아웃 | ○ |
| `cross-dissolving into [새 장면]` | [새 장면]으로 디졸브 | △ |
| `the whole frame spinning as it changes` | 화면 전체가 회전하며 전환 | △ |
| `a fast zoom blur carrying into [새 장면]` | 줌 블러로 [새 장면]으로 | ○ |
| `a radial blur pulling outward` | 방사형 블러가 바깥으로 | ○ |
| `digital glitch artefacts tearing across the frame` | 디지털 글리치가 화면을 찢음 | ○ |
| `the image breaking into pixelated blocks` | 화면이 픽셀 블록으로 깨짐 | ✗ |
| `the frame splitting into tiles that flip over` | 화면이 타일로 나뉘어 뒤집힘 | ✗ |
| `a warm light leak washing across the frame` | 따뜻한 라이트 릭이 화면을 훑음 | ○ |
| `a film burn flaring at the edge of frame` | 필름 번이 화면 가장자리에서 타오름 | ○ |

### ③ 편집기에서 쓸 때 (참고)

AI로 안 되는 것들은 편집기 기준 이름입니다.

| 한글 | 편집기 명칭 |
|---|---|
| 디졸브 | Cross Dissolve / Film Dissolve |
| 페이드 | Dip to Black / Dip to White |
| 모자이크 | Mosaic / Pixelate |
| 타일 | Block Dissolve / Tile |
| 스핀 | Spin / Cube Spin |
| 줌 블러 | Zoom Blur / Whip Zoom |
| 글리치 | Glitch / Digital Distortion |
| 라이트 릭 | Light Leak / Optical Flare |

💡 **가장 실용적인 조합**: AI로 **휩팬·가림·암전**만 만들고, 나머지 감성 전환은 편집기에서. 이렇게 하면 생성 시간을 낭비하지 않으면서 결과도 훨씬 깔끔합니다.

---

### ④ 그래픽 컷 편집 (원테이크가 아닐 때) ⭐

> 아래는 **컷을 쓰는 영상**의 표현입니다. 원테이크에서는 **클립 한가운데**에만 쓰세요.

| 영어 | 한글 |
|---|---|
| `snap zoom` | 급속 줌 (확 당김) |
| `a hard cut to [X]` | [X]로 하드컷 |
| `a hard graphic cut to huge typography` | 대형 글자로 그래픽 하드컷 |
| `a graphic match cut` | 형태가 이어지는 매치컷 |
| `a stroboscopic freeze` | 스트로보 정지 |
| `a rapid stroboscopic montage of three moments` | 세 순간의 빠른 스트로보 몽타주 |
| `a hard shutter flash` | 셔터 플래시 (카메라 터지듯) |
| `a sharp cut to white` | 흰 화면으로 샤프컷 |
| `a hard black cut` | 검은 화면으로 하드컷 |
| `a final pulse` | 마지막 한 번의 펄스 |
| `the poster bends and folds in 3D, then tears open` | 포스터가 3D로 접혔다 찢어져 열림 |
| `fragments become floating panels` | 조각들이 떠 있는 패널이 됨 |
| `all fragments snap together` | 조각들이 착 하고 합쳐짐 |
| `one panel expands to full screen` | 한 패널이 전체 화면으로 확대 |
| `all panels collapse into one frame` | 모든 패널이 한 프레임으로 모임 |
| `the interface collapses inward` | 인터페이스가 안쪽으로 접혀 사라짐 |

### ⑤ 잔상·고스트 효과

| 영어 | 한글 |
|---|---|
| `three offset silhouettes appear behind her` | 뒤에 어긋난 실루엣 세 개가 나타남 |
| `photographic motion ghosts` | 사진 잔상 같은 모션 고스트 |
| `ghost layers separate dramatically` | 잔상 레이어가 극적으로 분리됨 |
| `all ghosts collapse into the real character` | 모든 잔상이 실체로 합쳐짐 |
| `chromatic offset in gold, champagne and white` | 금·샴페인·흰색으로 어긋난 색수차 |

### ⑥ 브러시·잉크 리빌

| 영어 | 한글 |
|---|---|
| `a single black brushstroke sweeps across the frame` | 검은 붓질 하나가 화면을 훑음 |
| `the stroke reveals [X]` | 붓질이 [X]를 드러냄 |
| `the stroke transforms into [X]` | 붓질이 [X]로 변형됨 |
| `an ink-like streak` | 잉크 같은 궤적 |
| `black ink and gold particles orbit` | 검은 잉크와 금 입자가 공전 |

### ⑦ 그래픽 리빌 사운드

| 영어 | 한글 |
|---|---|
| `sharp graphic whooshes` | 날카로운 그래픽 휙 소리 |
| `typography impacts` | 글자가 박히는 충격음 |
| `precise impact accents` | 정밀한 임팩트 악센트 |
| `a soft click as each character lands` | 글자마다 부드러운 클릭음 |
| `one hard shutter snap` | 한 번의 강한 셔터음 |

---

## 10-6. 타이포 리빌 연출 컨셉 10종

> 캐릭터·제품 리빌 영상의 검증된 연출 틀입니다. 골라서 변형해 쓰세요.

| # | 컨셉 | 핵심 아이디어 |
|---|---|---|
| 1 | **키네틱 타이포 / 에디토리얼** | 순백 배경에 대형 글자가 쾅 박히고, 인물이 그 앞을 가로지름 |
| 2 | **바코드 / 스캐너 리빌** | 검은 화면을 스캐너가 훑으며 바코드 조각이 이름을 조립 |
| 3 | **분할 화면 / 프리즈 프레임** | 화면이 4패널로 나뉘어 각기 다른 순간을 보여주다 하나로 합쳐짐 |
| 4 | **거대 원 / 타깃 락** | 거대한 원 하나에서 시작해 확장하며 전신을 드러냄 |
| 5 | **잉크 브러시 / 시그니처 플로우** | 붓질 한 번이 화면을 훑으며 인물을 드러냄 |
| 6 | **홀로그램 캐릭터 셀렉트** | UI 선이 실루엣을 만들고 스캔이 순차적으로 해상 |
| 7 | **타이포 터널** | 글자로 만든 터널을 카메라가 통과 |
| 8 | **포스터 셰터** | 정지 포스터가 3D로 접히고 찢어지며 실체가 나옴 |
| 9 | **크로매틱 고스트** | 어긋난 잔상 실루엣이 분리됐다 합쳐짐 |
| 10 | **프리미엄 로고 리빌** | 점 → 선 → 실루엣 → 대형 로고 타이포로 성장 |

### ⭐ 이걸 원테이크로 바꾸려면?

위 컨셉들은 대부분 **빠른 컷**을 씁니다. 원테이크로 하려면 **컷을 카메라 이동으로 바꾸면** 됩니다.

| 원본 (컷 기반) | 원테이크 변환 |
|---|---|
| 하드컷으로 패널 전환 | 카메라가 패널 사이를 **실제로 이동** |
| 스냅줌 | 빠른 **푸시인**으로 대체 |
| 스트로보 프리즈 | **슬로모션 → 정속 복귀** 스피드램프로 |
| 포스터가 찢어지는 컷 | 카메라가 **찢어진 틈을 통과** |
| 스캐너 컷 | 스캐너 선을 따라 카메라가 **함께 이동** |
| 고스트 프레임 | 잔상을 **공간에 실재하는 오브젝트**로 |
| 화면 분할 | 실제 **유리·거울·기둥**으로 화면을 나눔 |

💡 **핵심 한 줄**: 컷으로 하던 것을 **카메라 동선으로** 바꾸면 그대로 원테이크가 됩니다.

---

## 10-7. 용어집

| 용어 | 뜻 |
|---|---|
| **이음매 (Seam)** | 클립과 클립이 겹치는 1.625초 구간 |
| **One-Take (latent)** | 이전 클립의 마지막을 다음 클립에 물려주는 모드 |
| **Auto-Stitch** | 겹침을 자동으로 잘라내고 하나로 합치는 기능 |
| **39프레임** | 겹침 구간의 프레임 수 (24fps 기준 1.625초) |
| **벡터로 끝내기** | 멈춤이 아니라 움직이는 상태로 클립을 끝내는 것 |
| **탄도 동작** | 한번 시작하면 되돌릴 수 없는 빠른 동작 (타격·점프 등) |
| **지속 가능 동작** | 1.6초 동안 예측 가능하게 계속되는 동작 (걷기·응시 등) |

---

## 📌 딱 한 문장으로 요약하면

> **클립 1의 마지막 프레임을 글로 찍어서, 그 글을 클립 2 맨 앞에 붙이고 시제만 바꾼다.**

이게 원테이크 프롬프트의 전부입니다.

---

*TJ ONE STUDIO — 원테이크 프롬프트 교본 v1.0*

# SPEC RELAY — v1.53.1 이후 변경 전체 (웹 / Canvers 전달용)

기준: 노드 v1.53.1(커밋 668c32a) 이후 커밋 `3665c80`과 그 뒤 커밋(영상 샘플러 목록). **웹과 Canvers는 아직 이 항목들을 모두 반영하지 않았다**(웹 `7cdd885`, Canvers `99b8b57`은 EmptyImage/ModelSamplingAuraFlow 검사 삭제만 한 상태). 서버(`nodes.py`) 변경 없음, 재시작 불필요. 노드에서는 문법만 확인했고 화면 검증은 사용자가 직접 한다. Character Sheet은 수정 금지.
Node Skin 변경은 포함하지 않는다.

## 1. 샘플러 / 스케줄러 전체 목록 (v1.53.1에서 웹·Canvers 미적용분 + 영상)
ComfyUI의 KSampler가 가진 **전체 목록**을 드롭다운에 보여 준다(이 PC 기준 sampler 66개, scheduler 11개).
- 목록은 `GET /object_info/KSampler` → `KSampler.input.required.sampler_name[0]` / `scheduler[0]` 에서 읽는다. 처음 한 번만 읽고 캐시, 읽은 뒤 화면을 다시 그린다. 실패하면 기존 짧은 목록(노드 `SAMPLERS` / `SCHEDULERS`)이 대체. 저장된 값이 목록에 없으면 목록 끝에 추가해 계속 선택 가능.
- 적용 위치 (노드 `web/one_node_minimax_h3.js`의 `ksList(kind, fallback, current)`):
  1. **H3 Image Generator(T2I / R2I)** Sampling 패널의 Sampler / Scheduler (v1.53.1).
  2. **H3 영상 생성(T2VA / FL2VA / REF2VA)**의 Sampling 아코디언 Sampler / Scheduler — 세 모드가 같은 패널을 쓰므로 한 곳. PDD 터보는 이전처럼 sampler를 euler로 고정(패널 안내 문구 그대로).
- 웹/Canvers: 이미지 카드(h3-image) 고급 옵션의 Sampler / Scheduler와, H3 영상의 Sampler / Scheduler를 같은 방식으로.

## 2. Split Sigma: Turbo step = LOW + HIGH (4 / 6 / 8 스텝 로라 지원)
이전: Split Sigma를 켜면 Turbo steps가 8로 잠기고 LOW(1~7)+HIGH = 8 고정. 이후: **전체 스텝 = Turbo step**, **LOW + HIGH = Turbo step**, 항상 8일 필요 없음(예: 7 = 6+1, 8 = 7+1, 8 = 6+2).
- 대상: **H3 Latent Upscaler**와 **H3 Latent Upscale Tiled (TJ)** 둘 다. Tiled도 이제 LOW/HIGH 칸이 있고 HIGH 기본 1, HIGH 칸 툴팁 "Tiled upscale samples tile by tile and takes a long time, so HIGH Sigma step 1 is recommended."(설명 문구에도 "Tiled is slow, so HIGH Sigma step 1 is recommended.").
- 코어(`core_minimax.js`):
  - `hiresTotalSteps(state)`: `state.hiresTotalOverride`가 있으면 그것(Postprocess용), 아니면 Turbo None이면 8, 아니면 `max(2, round(Number(state.pddNfe) || 8))`.
  - `hiresHighSteps(state)`: `clamp(round(state.hiresHighSteps ?? 1), 1, total − 1)`.
  - `hiresSplitStep(state)` = `hiresTotalSteps − hiresHighSteps`(LOW). 예전의 "Tiled는 항상 7" 분기 삭제.
  - `effectiveSteps`: `hiresActive`이면 `hiresTotalSteps(state)`(예전 8 고정 삭제).
  - 상태 키: `hiresHighSteps`(기본 1). 옛 저장값 변환: `saved.hiresHighSteps ?? (saved.hiresSplitStep != null ? max(1, 8 − saved.hiresSplitStep) : 1)`. `hiresSplitStep`(LOW)은 하위 호환용으로만 남김. 프리셋 키 목록(`presets_minimax.js`)에 `hiresHighSteps` 추가.
- 그래프(`graph_builder_minimax.js`): 클립 그래프 `SplitSigmas.step = hiresSplitStep(state)`(변경 없음, 값만 바뀜). `addH3LastStep`/`buildHiresStage`(Postprocess 경로)의 `BasicScheduler.steps = hiresTotalSteps(state)`, `SplitSigmas.step = hiresSplitStep(state)`(예전 8, 7 고정 삭제).
- UI(`one_node_minimax_h3.js` Turbo 섹션): Turbo LoRA(PDD)의 `steps` 칸(`pddNfe`)을 Split Sigma가 켜져 있어도 **잠그지 않음**(값은 항상 `state.pddNfe`). LOW / HIGH 칸은 두 업스케일러 모두 표시, 한쪽을 입력하면 다른 쪽이 자동 계산(합 = Turbo step, HIGH는 1 ~ total−1). 설명: `Turbo step ${total} = LOW + HIGH. The latent upscale runs after the LOW Sigma steps, then the HIGH Sigma steps run at Final MP.` + (Tiled: ` Tiled is slow, so HIGH Sigma step 1 is recommended.` / H3: ` LOW 7 / HIGH 1 is recommended for 8 steps.`).
- 갤러리 메타: `hiresHighSteps` 저장(예전 `hiresSplitStep` 대신), 복원 시 `meta.hiresHighSteps` 우선, 없으면 `meta.hiresSplitStep`에서 `max(1, 8 − 값)`.

## 3. Postprocess → Latent Upscale (Use H3): 업스케일(HIGH) 스텝 설정
이 모드는 7+1이 아니라 "영상을 인코딩해 업스케일하고 리파인 샘플링"이므로, 클립이 만들어진 Turbo step 스케줄 중 **HIGH Sigma step만큼만** 샘플링한다(LOW 구간은 다시 돌리지 않음).
- 설정(Postprocess 전용, 메인 H3 모드와 별개): 상태 키 `ppH3Steps`(기본 8 = 클립의 Turbo step), `ppH3HighSteps`(기본 1). `ppH3State`가 `hiresTotalOverride: s.ppH3Steps ?? 8`, `hiresHighSteps: s.ppH3HighSteps ?? 1`로 넘김.
- UI: 방식 `h3lat` 패널의 Turbo/LoRA 아래, "Bypass H3 Memory Optimization" 위에 입력칸 두 개 `Turbo step`, `HIGH Sigma step`(Tiled면 HIGH 칸에 같은 툴팁) + 설명 `Turbo step = the step count this clip was made with (its Turbo LoRA: 4, 6, 8 …); the schedule is LOW ${total−high} + HIGH ${high}. The clip is upscaled, then only the HIGH Sigma steps are sampled (refine). ` + (Tiled: `Tiled is slow, so HIGH Sigma step 1 is recommended.` / `HIGH 1 is recommended.`). Turbo step을 바꾸면 HIGH를 total−1 이하로 맞춤. 하단 설명 문구도 "Re-runs only the HIGH Sigma steps of an H3 clip (its Turbo step = LOW + HIGH): …"로 변경.
- 기본값(8, 1)이라 기존 동작(7+1)과 같다.

## 4. Postprocess → Latent Upscale (Use H3): 클립 메타 우선, LLM은 최후
이전: 메타에 H3 프롬프트가 있어도 Reference 클립 등은 항상 LLM을 돌려 오래 걸렸다. 이후(`ppH3Plan`, `one_node_minimax_h3.js`): 
1. 영상 메타(`ppSourceFullMeta`)에 **H3 프롬프트**(`integrated_multimodal_description` / `[Shot 1]` / `<Picture|Video|Audio …>` 포함)가 있으면 **LLM 없이** 기록된 생성 방식 그대로:
   - `meta.mode === "reference"`(REF2VA): `meta.refImages`(최대 9)가 있고 **모두 input 폴더에 존재**(`HEAD /view?filename=…&type=input`이 전부 ok)하면 → Reference 모델(`kind:"ref"`)로, 메타 프롬프트 그대로 + 저장된 레퍼런스 이미지 + `refImagesMp` + `refImageSize`(없으면 "match").
   - 그 외 모드이고 프롬프트에 `<Picture|Video|Audio …>`/`@이름` 태그가 없으면 → FL2VA 모델(`kind:"fl"`), 메타 프롬프트 그대로. `meta.mode === "t2v"`(T2VA)면 `noKeyframes: true`(시작/마지막 이미지 없이 텍스트만), FL2VA면 영상의 첫 프레임·마지막 프레임을 키프레임으로(기존 동작).
2. 위 조건을 못 채우면(메타 유실 / H3 형식 아닌 프롬프트(LTX 등) / REF2VA인데 레퍼런스 이미지가 없거나 input에서 사라짐) → **FL2VA + LLM**:
   - 분석 이미지는 영상의 **첫 프레임과 마지막 프레임 2장만**(`grabSampleFrames(src, 1, 2, 2, true)`: 새 5번째 인자 `edges`=true면 count 2, t = 0.05초 / duration−0.05초). 예전엔 최대 8장 샘플링.
   - 기존 프롬프트가 있으면(REF2VA 브리프, LTX 프롬프트) `writeFromVideo`의 `base`로 넘겨 **FL2VA 프롬프트로 수정**: 사용자 메시지 문구 `(This is the clip's existing prompt, written for another mode or model (reference tags like <Picture N> / @name, or an LTX-style prompt). Revise it into a First/Last-frame brief: keep its story, actions, camera, dialogue, sound and style, and replace every reference tag with what the starting and ending frames actually show.)`.
   - 프롬프트가 전혀 없으면 두 프레임 분석만으로 FL2VA 프롬프트를 새로 작성(기존 문구 `(no text supplied — base the brief on the frame analysis above)`).
   - 이 경로의 모델은 항상 FL2VA(Reference 모델로 돌리지 않음).
- 그래프(`addH3LastStep`의 `condAt`): Reference 클립이면 `MiniMaxH3ReferenceToVideo`에 `ref_image_size: o.refImageSize || "match"`, 그리고 저장된 레퍼런스 이미지를 `LoadImage` + (`refImagesMp`가 0보다 크면 `ImageScaleToTotalPixels`) → `ref_images.ref_image_${i}`로 연결(클립 그래프 `buildConditioning`와 같은 방식, 노드 id `N.ref(i)` / `N.refResize(i)`). FL2VA는 `first_frame`/`last_frame` 키프레임을 `!o.noKeyframes`일 때만 연결. 이 값들은 `h3Opts`(`refImages`, `refImagesMp`, `refImageSize`, `noKeyframes`)로 전달(분할 Split mode 조각에도 그대로 전달됨).
- 제한: 레퍼런스 영상/오디오는 이어받지 않고 이미지만. 라이브러리 에셋(`assetRef`)만 쓴 Reference 클립은 레퍼런스 이미지 파일 기록이 없어 FL2VA + LLM 경로.

## 5. 웹 / Canvers 구조에 따른 참고
- 위 1~4는 H3 영상/후처리 쪽 로직이다. 웹은 같은 파일 구조(`src/tools/minimax_h3/…`)에 그대로 옮기면 된다. Canvers는 카드/그래프 구조라 Postprocess(Video Upscale 카드의 H3 Latent Upscale 엔진이 있다면) 쪽만 해당, 없는 항목은 "해당 없음"으로 보고.
- 1번(샘플러/스케줄러 전체 목록)은 웹과 Canvers의 이미지 카드와 영상 카드 모두 해당.
- 노드에서 화면 검증은 사용자가 직접 한다. 웹/Canvers도 타입 검사/빌드 후 보고하고, 실제 렌더 검증이 필요하면 사용자에게 요청.

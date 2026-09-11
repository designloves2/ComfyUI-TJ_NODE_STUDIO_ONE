# SPEC — H3 Face Refine

**상태: 1차 구현 완료 (랭킹 규칙 경로), 실기기 스모크 테스트 통과 (2026-09-12).** 그래프
빌더·Settings·좌측 패널 UI 전부 커밋됨(node — 커밋 해시는 git log 참고), 그리고 실제로
큐에 올려서 `H3FaceTrackCrop → H3InjectVideoLatent → TJ_H3_AudioLock → H3PerFrameDenoise →
샘플링 → H3FaceStitch → SaveVideo` 전체 그래프가 처음부터 끝까지 에러 없이 완주해서 실제
영상이 나오는 것까지 확인했다. 과정에서 TJ_NODE 쪽 실제 버그 하나를 발견·수정했다 — §11.
아직 남은 것: (1) Manual Select(Pick Faces 모달)는 프런트가 없어 select 드롭다운에서
빠져 있음(§10 5번), (2) 이번 스모크 테스트는 3인 그룹샷(원래 얼굴이 작지 않은 클립)으로
그래프 동작만 확인한 것 — **진짜 작은 얼굴 클립으로 화질 개선 여부는 아직 실사용 검증 전**,
(3) VRAM 실측(§9-5) 아직 안 함. 웹 미러링은 이 나머지가 끝난 뒤 진행(사용자 지시).
이 문서는 원래 `github.com/Carasibana/ComfyUI-H3-FaceRefine`
(MIT, 2026-09 기준 v1.1.0)를 그대로 우리 STUDIO_ONE에 "완성된 H3 클립을 후처리하는 기능"으로
붙이기 위한 조사·설계 기록이다.

**출처**: 2026-09-12, `ComfyUI-H3-FaceRefine`을 `custom_nodes/`에 실제로 클론해서 `nodes.py`
(3372줄)·`picker_api.py`·`__init__.py` 원본을 직접 읽고 검증했다 (README만 보고 쓴 초안이 아님).
아래 §3의 클래스명·INPUT_TYPES·RETURN_TYPES는 전부 소스 코드 기준. **아직 ComfyUI에 등록만 안
했다** — 클론까지만 해둔 상태라 재시작 전엔 노드 목록에 안 뜸.

---

## 1. 무엇을 붙이는가

MiniMax H3는 **얼굴이 화면에서 작게 나올 때 얼굴을 뭉개서 그린다** — 해상도 문제가 아니라
"화면에서 머리가 차지하는 비율" 문제라 720p 이상에서도 그대로 남는다.

이 팩은 완성된 H3 영상을 받아서:
1. 프레임마다 얼굴을 검출·추적
2. 얼굴만 크롭해서 캔버스에 꽉 채움 (작은 얼굴 → 크게)
3. **H3한테 그 크롭만 다시 img2img로 재생성**시킴 — H3 공식 노드엔 없는 진짜 img2img 경로를
   이 팩이 직접 구현했다 (`H3 Inject Video Latent`)
4. 재생성된 얼굴을 원본 위치에 색보정 + 페더링해서 합성

Impact Pack의 FaceDetailer를 정지 이미지에서 영상으로 이식한 구조. **우리 쪽에서 보면 이건
"새 생성 모드"가 아니라 LTX Upscale과 같은 급의 "완성된 클립을 골라 후처리하는 파이프라인"**이다
— 갤러리에서 클립을 고르고, 별도 그래프를 큐에 올리고, 결과를 다시 갤러리에 저장하는 흐름.

**사용자 확정 (2026-09-12): LTX 2.5 Upscale과 H3 Face Refine 둘 다 "후처리(Post-process)"라는
같은 상위 메뉴 아래 항목으로 묶는다.** 지금은 LTX Upscale이 H3 도구의 4번째 생성 모드
(`T2VA/FL2VA/REF2VA/LTX UPSCALE`)처럼 배선돼 있는데, Face Refine을 붙이는 시점에 두 기능을
"생성 모드" 목록에서 분리해 별도의 "후처리" 메뉴/탭으로 재편할지 여부는 UI 설계(§5) 단계에서
LTX Upscale의 기존 UI와 함께 다시 검토한다 — 지금 이 스펙에서 확정하는 건 "두 기능이 같은
카테고리"라는 사실뿐, 실제 메뉴 구조 변경은 별도 작업.

---

## 2. 새 의존성

| 대상 | 이유 |
|---|---|
| `ComfyUI-H3-FaceRefine` (Carasibana, MIT) | 이 스펙의 핵심 노드 전부. **2026-09-12 `custom_nodes/`에 이미 클론해둠** (소스 조사용, 아직 install 스크립트엔 미반영) |
| ~~`ComfyUI-H3-NativeAudioLock`~~ | **불필요로 결론** — §9-2에서 우리 자체 `TJ_H3_AudioLock`으로 대체하기로 확정. 아래 참고 |
| ~~`ComfyUI-Impact-Pack`~~ | **불필요로 결론** — §9-1에서 검증. 얼굴 검출기 드롭다운은 Impact Pack 없이도 뜸 |
| `ultralytics`, `scipy`, `insightface`, `scenedetect` (Python pkg) | FaceRefine의 `requirements.txt`에서 자동 설치됨 |
| (선택) `ComfyUI-GGUF` | 이미 설치돼 있음 — FaceRefine 예제도 12GB 맞추려면 GGUF로 교체 권장 (§2-A) |

**결론: 새 ComfyUI 팩 의존성은 `ComfyUI-H3-FaceRefine` 하나뿐.** 애초 조사 때 README가 언급한
`ComfyUI-H3-NativeAudioLock`(별도 저장소 — 실제로는 `SveSop/ComfyUI-H3-NativeAudioLock`, Carasibana
소유가 아니었음)과 Impact Pack 둘 다 소스 확인 결과 불필요로 판명. 설치 스크립트 작업량이 원래
예상보다 훨씬 가벼워짐.

**모델 파일 (사용자가 직접 받아야 함)**:

| 모델 | 위치 | 용도 | 상태 |
|---|---|---|---|
| `face_yolov8m.pt` (Bingsu/adetailer) | `models/ultralytics/bbox/` | 얼굴 검출 — **유일한 필수 모델** | ✅ **이미 모델 폴더에 있음** (2026-09-12 확인) |
| `person_yolov8m-seg.pt` (선택) | `models/ultralytics/segm/` | 얼굴 검출 실패 프레임의 폴백 (몸통에서 머리 위치 추정) | ✅ **이미 모델 폴더에 있음** (2026-09-12 확인) |
| SAM 모델 (선택) | `models/sams/` | 얼굴 모양 마스크 — 기본은 사각형 마스크로도 충분, README도 "대체로 사각형이 더 낫다"고 적어둠 | 미확인, 필요 시 나중에 |
| CLIP Vision (선택) | `models/clip_vision/` | identity_model=clip_vision — IPAdapter/Redux용으로 이미 있을 가능성 높음 | 미확인, 필요 시 나중에 |
| MiniMax H3 unet/clip/vae, 터보 LoRA | 이미 우리가 씀 | 그대로 재사용 | ✅ |

anime/일러스트 얼굴은 `face_yolov8m.pt`가 못 잡을 수 있음 — 별도 애니메 얼굴 검출기 필요
(`deepghs/anime_face_detection` 등). 이건 사용자가 실제 소재를 보고 나중에 판단할 부분.

**필수 모델이 이미 준비돼 있으므로 §10 구현 순서의 "모델 준비" 단계는 스킵 가능.**

### 2-A. H3 GGUF 조합 (12GB 대상, 참고용 — 우리는 16GB라 필수 아님)

FaceRefine 예제 워크플로(`H3_Face_Refine_Auto_Select.json`)에 실제 저장된 GGUF 로더 값
(뮤트된 "GGUF alternative" 쌍, 직접 JSON 확인 2026-09-12):

| 용도 | GGUF 파일명 |
|---|---|
| H3 디퓨전 모델 | `minimaxH3GGUFFl2vaRef2va_v10.gguf` |
| 텍스트 인코더 (Qwen3-VL) | `qwen3vl_32b_minimax_h3-Q4_K_M.gguf` |

(참고: 같은 워크플로의 stock/safetensors 쌍은 `minimax_h3_fl2va_pruned_int8_convrot.safetensors`
+ `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`.) 우리 그래프 빌더는 어차피 `.gguf` 파일명이면
자동으로 GGUF 로더로 분기하므로(기존 H3 패턴 재사용), 이 조합은 실기기 VRAM 검증 시 참고용으로만
필요 — 별도 구현 작업 없음.

---

## 3. 노드 인벤토리 (소스 코드 확인, 2026-09-12)

`ComfyUI-H3-FaceRefine/nodes.py`를 직접 읽고 확정. 카테고리 전부 `MiniMax H3/Face Refine`.
표시 이름(왼쪽 열)과 실제 `NODE_CLASS_MAPPINGS` 키(코드 블록)가 다르므로 그래프 빌더에서는
**반드시 클래스 키**를 써야 함 — 아래 각 행에 명시.

| 노드 (표시명) | 클래스 키 | 입력 | 출력(`RETURN_NAMES`) | 비고 |
|---|---|---|---|---|
| H3 Load Video + Face Select | `H3FaceSelect` | required: `video`(STRING, 경로), `detector`, `confidence`(0.35), `select`(`manual` 기본 — largest_face/smallest_face/left_most/right_most/top_most/bottom_most/centre_most/closest_to_xy/detector_score/identity_reference/manual), `select_index`(0), `confirmed_pick`(STRING, "0,1,1" 형식) · optional: `cut_detection`(none/auto (pyscenedetect)), `cut_threshold`(3.0), `skip_first_frames`, `frame_load_cap`, `select_every_nth`, `identity_reference`(IMAGE), `identity_clip_vision`, `identity_model`(insightface/clip_vision/ccip), `identity_threshold`(0.28), `X`/`Y`/`frame_index`(closest_to_xy 전용) | `images, audio, face_pick, preview, report, frame_count, fps` — `face_pick`은 커스텀 타입 `H3FACEPICK` | §6 Manual Select의 핵심 노드. `confirmed_pick`은 그래프 실행 시점에 **다시 읽히는** 값 — Pick 팝업은 별도 백엔드(`picker_api.py`)로 미리 스캔해서 카드로 보여주고 이 STRING 위젯에 답을 써넣는 구조(§6) |
| H3 Face Track + Crop | `H3FaceTrackCrop` | required: `images`, `detector`, `confidence`(0.35), `crop_factor`(2.5), `canvas_width`(768)/`canvas_height`(768), `canvas_mode`(manual/auto_no_downscale/auto_capped_768), `smooth_window`(21), `size_smooth_window`(51), `smooth_method`(gaussian/savgol/moving_average), `size_mode`(max_of_clip/per_frame) · optional: `identity_reference`, `identity_track`(True), `identity_threshold`(0.28), `select`(largest_face 기본, 9종), `fallback_detector`(none 기본), 그 외 select_index/identity_model/cut_detection/cut_threshold/absent_shots/identity_clip_vision/X/Y/frame_index/`face_pick`(H3FaceSelect에서) | `crops, transform, preview, report, canvas_w, canvas_h, frame_count` — `transform`은 커스텀 타입 `H3FACEXFORM` | `face_pick`이 연결되면 자체 검출 생략 |
| H3 Inject Video Latent (img2img) | `H3InjectVideoLatent` | required: `av_latent`, `images`(crops), `vae` — **위젯 없음** | `av_latent, report` | 진짜 img2img 경로. strength는 이 노드가 아니라 `BasicScheduler`의 `denoise`로 결정 |
| H3 Per-Frame Denoise | `H3PerFrameDenoise` | required: `model`, `av_latent`, `transform`, `denoise_multiplier_small_face`(1.0), `denoise_multiplier_large_face`(0.35), `scale_mode`(absolute_px/relative_to_clip), `face_px_small`(30.0), `face_px_large`(120.0), `gamma`(1.0), `smooth_frames`(9) | `av_latent, report, model` | **`model` 필수 입력이자 필수 출력** — 코드로 확인: 순수하게 자체 완결적인 MODEL 패치(`_mask_via_sampler_only` + `_renoised_inpaint`)이고, 어떤 특정 오디오락 노드의 흔적(예: `transformer_options` 플래그)에도 의존하지 **않음** → §9-2 결론의 근거 |
| H3 Face Mask (SAM) (선택) | `H3FaceMaskSAM` | required: `crops`(원본 crop, 디코드 결과 아님), `sam_model`(SAM_MODEL — Impact Pack `SAMLoader` 필요), `transform`, `threshold`(0.93), `dilation`(0), `temporal_smooth`(5) | `masks, report` | 1차 구현 스킵 권장 (기존 판단 유지) — 이것만 유일하게 Impact Pack이 실제로 필요한 지점(SAMLoader) |
| H3 Face Stitch Back | `H3FaceStitch` | required: `base_images`, `refined_crops`, `transform`, `paste_region`(face_only 기본/face_ellipse/full_crop), `mask_dilation`(16), `feather`(6), `colour_match`(1.0), `blend`(1.0), `undetected_frames`(fade_out 기본/skip/composite_anyway) · optional: `feather_scales_with_crop`(False), `masks` | `images` | 최종 합성 |
| H3 Face Transform Info (디버그) | `H3FaceTransformInfo` | `transform`, `max_rows`(12) | `info`(STRING, OUTPUT_NODE) | 그래프 필수 아님 |

### 3-A. 커스텀 링크 타입

`H3FACEXFORM`(트래킹 결과 — box 좌표열/crop_factor/segments/absent 등)과 `H3FACEPICK`(사전 검출
결과)은 이 팩만의 커스텀 타입이다. 우리 그래프 빌더 JS는 이 값들을 들여다볼 필요 없이 그냥
node-id 링크로만 연결하면 됨(ComfyUI API 그래프 포맷은 타입 검사를 안 함).

---

## 4. 그래프 구성 (제안)

LTX Upscale(`buildLtxUpscaleGraph`, `graph_builder_minimax.js:839`)과 같은 패턴 —
"소스 클립 픽 → 별도 그래프 → 단일 큐 실행 → 갤러리 저장". 새 함수
`buildFaceRefineGraph(state, avail, opts)`로 신설.

```
G:load        VHS_LoadVideo(sourceFile)                       → images, frame_count, audio
                (Manual Select 대응 시 이 자리를
                 H3FaceSelect로 교체 — §6, confirmed_pick 위젯 포함)

G:track       H3FaceTrackCrop(images=G:load[0], detector, ...)
                → crops, transform, canvas_w, canvas_h, frame_count
                (face_pick=[G:load,face_pick] 연결 시 자체 검출 생략)

               ── H3의 기존 레퍼런스 경로 그대로 재사용 ──
G:unet/clip/vae   UNETLoader / CLIPLoader / VAELoader(video+audio)   (이미 있는 헬퍼 재사용)
G:cond            MiniMaxH3ReferenceToVideo(refs=Ref1/Ref2, prompt,
                    width=[G:track,canvas_w], height=[G:track,canvas_h],
                    length=[G:track,frame_count])                   → av_latent(빈 latent)

G:inject      H3InjectVideoLatent(av_latent=[G:cond], images=[G:track,crops], vae)
                → av_latent(실제 프레임이 인코딩된 latent)

G:turbo       (선택) LoraLoaderModelOnly — 기존 터보 LoRA 체인 그대로

G:audiolock   TJ_H3_AudioLock(av_latent=[G:inject], audio=원본 오디오, audio_vae,
                mode="lock", fit="pad_silence")                      → av_latent, audio, report
                (§9-2 결론: 우리 자체 노드로 통일. model은 건드리지 않으므로
                 G:turbo/G:ckAttn 체인에서 나온 model을 그대로 H3PerFrameDenoise에 넘김)

G:denoise     H3PerFrameDenoise(model=[G:turbo 체인 마지막], av_latent=[G:audiolock,av_latent],
                transform=[G:track,transform], denoise_multiplier_*, face_px_*, ...)
                → av_latent, report, model   ← 이 model을 아래 둘에 연결해야 함

G:guider      BasicGuider(model=[G:denoise,model], conditioning=positive)
G:sched       BasicScheduler(model=[G:denoise,model], steps, denoise=0.40 기본)
G:sampler     SamplerCustomAdvanced(guider, sigmas=[G:sched], latent_image=[G:denoise,av_latent])

G:decode      VAEDecode(samples=[G:sampler], vae)                    → refined_crops(images)

G:stitch      H3FaceStitch(base_images=[G:load,0], refined_crops=[G:decode],
                transform=[G:track,transform], paste_region, feather, colour_match, blend,
                undetected_frames)                                   → images(최종)

G:video       CreateVideo(images=[G:stitch], fps, audio=[G:audiolock,audio])
G:save        SaveVideo(video, filename_prefix=`${folder}/${stem}_FACEREFINE`)
```

**오디오락 노드 교체 근거 (§9-2 확정)**: `H3PerFrameDenoise`의 실제 코드(`nodes.py:2493-2568`)를
읽어 확인 — `MiniMaxH3NativeAudioLock`이 남기는 어떤 모델 레벨 표식(`transformer_options` 플래그
등)에도 의존하지 않는, 순수하게 자체 완결적인 MODEL 패치다. 유일하게 기대하는 건
`av_latent["noise_mask"]`가 이미 NestedTensor(video=1, audio=0) 형태로 와 있어야 한다는 것뿐이고,
우리 `TJ_H3_AudioLock`도 lock 모드에서 정확히 그 형태를 만든다(`h3_audio_lock.py:179-187` 확인).
**그래서 `MiniMaxH3NativeAudioLock`(제3자 저장소, `SveSop/ComfyUI-H3-NativeAudioLock`)을 새로
설치할 필요가 없다** — 우리 자체 노드가 유지보수 가능하고, remix 모드/fit 옵션/무선 Set-Get/한국어
리포트까지 더 낫다. `model` 출력이 없다는 차이는 무관 — `H3PerFrameDenoise`에 넘길 `model`은
오디오락이 아니라 터보 LoRA/어텐션 패치 체인의 마지막 출력을 그대로 쓰면 된다.

**denoise 기본값 주의** (README §Denoise): H3는 flow-matching + 큰 sigma shift라 SDXL식
denoise 감각이 전혀 안 통함. `shift=12`에서 `denoise=0.25`도 effective sigma 0.800 —
거의 완전 재생성. 예제 워크플로 기본은 `denoise=0.40`이고 `H3 Per-Frame Denoise`가 그 위에서
얼굴 크기별로 곱해 내림(큰 얼굴 ×0.35). **이 두 값은 세트로 튜닝된 것** — `H3 Per-Frame Denoise`를
빼고 쓸 거면 base denoise를 훨씬 낮춰야 함.

---

## 5. UI 설계 (제안)

LTX Upscale 좌측 패널(`renderLtxUpscaleLeft`, `one_node_minimax_h3.js`) 패턴을 그대로 따른다 —
"소스 카드 + From gallery/Upload + 파라미터 아코디언".

- **소스 카드**: 갤러리 미러링 픽커(`ctx.pickVideoFromGallery`) 재사용, 정사각/16:9는 실제
  클립 비율 그대로 — LTX Upscale은 정사각으로 강제했지만 얼굴 리파인은 원본 화면비 유지가 맞음
- **Ref 1 / Ref 2**: H3의 기존 레퍼런스 이미지 슬롯 그대로 재사용 (`ui_clip_media_slots.js`) —
  캐릭터 정체성 유지용, 이미 있는 컴포넌트
- **Prompt**: 소스 클립의 저장된 프롬프트를 자동 로드 (LTX Upscale의 `setLtxSource` 패턴 재사용)
- **Face 선택 아코디언**:
  - `select` 드롭다운 9종 (largest_face 기본)
  - `identity_reference` — 레퍼런스 이미지 중 하나를 얼굴 앵커로 쓸지 토글 (크라우드 씬 대응)
  - `cut_detection` 체크박스 — 컷이 있는 클립이면 켜기
  - **Manual pick(Pick faces)도 1차 구현에 같이 포함** — §6 참고 (사용자 확정: 나중 확장이 아니라
    처음부터 같이 만든다)
- **Crop/Canvas 아코디언**: `crop_factor`(2.5), `canvas_mode`(auto_capped_768 기본 — VRAM 안전),
  `smooth_window`
- **Denoise 아코디언**: base denoise, `denoise_multiplier_small/large_face`, `face_px_small/large`
  — 기본값 그대로 노출, 필요할 때만 건드리게
- **Stitch 아코디언**: `paste_region`(face_only 기본), `feather`, `colour_match`, `blend`
- Settings → Models에 "H3 Face Refine" 패널 신설: `faceDetector`, `fallbackDetector`(선택),
  `samModel`(선택), `identityClipVision`(선택) — LTX 2.5 Upscale 패널과 같은 톤

---

## 6. Manual Select(Pick faces) — 1차 구현에 포함, 2중 구조로

**사용자 확정**: 나중 확장이 아니라 처음부터 같이 만든다. 사용자가 지적한 그대로 —
"여러 명 중 한 명을 고르는 기능이면, 미리 디텍트해서 선택하고 그다음 실행되는 2중 구조여야
한다"는 게 정확히 이 팩의 실제 구현 방식이다. **좋은 소식: 그 2단계 구조의 무거운 쪽(검출
백엔드)은 이미 FaceRefine 팩이 다 만들어뒀다** — `picker_api.py`를 직접 읽고 확인.

### 6-A. 2단계 구조 (팩이 이미 구현한 것)

**1단계 — 사전 스캔 (`POST /h3_facerefine/scan`)**: 영상 전체에 얼굴 검출기를 돌려서 샷(컷)마다
대표 프레임 + 얼굴 박스 좌표 + JPEG 썸네일을 반환. 블로킹 작업이라 워커 스레드에서 돔.
- **캐싱**: 검출 결과에 영향 주는 파라미터(`detector`/`confidence`/`cut_detection`/`cut_threshold`
  /`skip_first_frames`/`frame_load_cap`/`select_every_nth`)로 캐시 키를 만들어, 같은 조건이면
  재스캔 없이 즉시 반환. `select`만 바뀌면 캐시된 검출 결과에서 카드만 다시 렌더링(재검출 안 함)
- **GPU 충돌 가드**: 렌더링 중이면 스캔 자체를 거부(`_RenderBusy`) — "렌더 중엔 GPU를 나눠 쓰면
  얼굴을 놓칠 수 있어 스캔 결과를 믿을 수 없다"는 이유. `force`로 우회 가능
- **진행률**: ComfyUI 자체 웹소켓(`PromptServer.instance.send_sync`)으로 `h3_facerefine/progress`
  이벤트를 쏨 — 우리 쪽도 같은 웹소켓을 이미 쓰고 있으니 그대로 리슨하면 됨
- 응답: `{frames, width, height, fps, source, path, shots:[{segment, frame, faces, boxes, jpg}], cached}`
  — `shots`가 샷별 카드 데이터. `boxes`는 0-1 정규화 좌표라 화면 크기 상관없이 오버레이 가능

**2단계 — 확정 (`confirmed_pick`)**: 사용자가 카드마다 얼굴 번호를 클릭 → 콤마로 구분된 인덱스
문자열("0,1,1")을 `H3FaceSelect` 노드의 `confirmed_pick` STRING 위젯에 써넣음. **실제 그래프
실행 시점에는 이 팩의 `H3FaceSelect` 노드가 자기 나름대로 다시 로드+검출을 하고, 그때
`confirmed_pick`을 읽어서 각 샷의 주인공을 확정**한다 — 즉 1단계 스캔은 순전히 "미리보기 +
선택 UI"용이고, 실제 실행 데이터 경로는 노드 자신이 다시 만든다(캐시 재사용 없음, 그래프 실행은
독립적).

부가 라우트: `GET /h3_facerefine/videos`(input 폴더 영상 목록), `GET /h3_facerefine/preview`(영상
스트리밍, range 지원 — path가 input 폴더 밖이어도 서빙), `POST /h3_facerefine/preview_xy`
(`closest_to_xy` 모드용 — 좌표 찍으면 그 프레임에 크로스헤어 + 가장 가까운 얼굴 하이라이트).

### 6-B. 우리가 만들 것 (프런트엔드만)

**백엔드는 FaceRefine 팩이 이미 다 갖고 있으므로, 우리는 그 라우트를 우리 자체 JS에서 호출하는
Pick Faces 모달만 새로 만들면 된다** — 백엔드 재구현 불필요. 이게 처음 조사 때 "별도 작업량"이라
1차 구현에서 뺀다고 판단했던 근거를 뒤집는다: 실제로는 UI 껍데기 하나만 얹으면 됨.

- 소스 카드 옆에 "얼굴 선택" 버튼(select=manual일 때만 노출)
- 클릭 시 모달 오픈 → `POST /h3_facerefine/scan`에 현재 패널의 detector/confidence/cut_detection
  등을 실어 보냄 → 응답의 `shots[]`를 카드 그리드로 렌더링(각 카드: JPEG + 박스 오버레이 + 얼굴
  번호 칩, LTX Upscale 갤러리 카드 스타일 재사용)
- 카드 클릭으로 얼굴 선택("not in this shot"도 옵션, -1로 기록) → 다 고르면 `confirmed_pick`
  문자열을 만들어 `state.faceRefinePick`에 저장, 그래프 빌더가 `H3FaceSelect.confirmed_pick`으로
  그대로 흘려보냄
- 렌더 중엔 스캔 버튼 비활성화 + "렌더가 끝난 뒤 다시 시도하세요" 안내(백엔드 가드와 동일 이유)
- 영상/detector/confidence/cut 설정이 바뀌면 `confirmed_pick`을 자동으로 비움(팩의 `H3FaceSelect`
  자체도 이 값들이 바뀌면 픽이 무의미해진다고 전제 — 우리 프런트도 같은 규칙 적용)

### 6-C. 그래프 빌더 쪽 변경

`select === "manual"`일 때 `G:load`를 `VHS_LoadVideo` 대신 `H3FaceSelect`로 교체(§4 그래프의
분기점). `H3FaceSelect`의 `face_pick` 출력을 `H3FaceTrackCrop.face_pick`에 연결하면 트래커가
자체 검출을 생략하고 그대로 이어받는다(§3 확인 사항).

---

## 7. 가용성 리스트 반영 (양쪽 다 — 잊으면 "설치 안 됨" 오탐)

`project_mmh3_dual_availability_list` 메모 그대로 — **두 파일 다** 고쳐야 함:

- `nodes.py` `MMH3_OPTIONAL_NODES`
- `web/minimax/api_minimax.js` `MMH3_OPTIONAL_NODES`

추가할 노드 (§3 확인된 실제 클래스 키): `H3FaceSelect`, `H3FaceTrackCrop`, `H3InjectVideoLatent`,
`H3PerFrameDenoise`, `H3FaceStitch`, `H3FaceTransformInfo`, 그리고 (선택 기능용) `H3FaceMaskSAM` +
`SAMLoader`(Impact Pack). `MiniMaxH3NativeAudioLock`은 §9-2 결론에 따라 리스트에 넣지 않음 —
우리 자체 `TJ_H3_AudioLock`(이미 리스트에 있음)을 그대로 씀.

---

## 8. 설치 스크립트 반영

`install_requirements.*` / `install_comfyui_dependencies.bat` 양쪽에:
- `ComfyUI-H3-FaceRefine` 클론 — **이게 유일하게 새로 필요한 저장소** (§2 결론: NativeAudioLock도
  Impact Pack도 불필요)
- `face_yolov8m.pt`/`person_yolov8m-seg.pt` 자동 다운로드는 하지 않음(다른 자동 모델 다운로드
  사례와 동일 정책) — 다만 우리 서버엔 이미 둘 다 있으므로 실질적으로 문제 없음. 신규 설치자를
  위해 안내 배너에 "Bingsu/adetailer에서 받아 `models/ultralytics/bbox/`(+`/segm/`)에 넣으세요"
  텍스트만 준비
- SAM 마스크(`H3FaceMaskSAM`)는 1차 구현에서 배선 안 하므로 Impact Pack 설치는 스킵 — 나중에
  SAM 옵션을 켤 때 별도로 안내

---

## 9. 결정/실측 필요 항목 (2026-09-12 사용자 지시로 정리)

1. ~~Impact Pack 필요 여부~~ → **해결.** `_detector_list()`/`_load_detector()` 소스 확인
   (`nodes.py:20-60`) — `folder_paths.get_filename_list("ultralytics_bbox")`가 실패하면
   조용히 캐치하고 `models/ultralytics/{bbox,segm}` 디렉터리를 직접 스캔하는 폴백 경로가 있음.
   **Impact Pack 없어도 완전히 동작.** SAM 마스크(선택 기능)만 Impact Pack의 `SAMLoader`가 필요.
2. ~~오디오락 노드 선택~~ → **해결, 우리 `TJ_H3_AudioLock`으로 확정.** §4의 근거 문단 참고 —
   유지보수 가능한 쪽으로 결정하라는 지시대로, 서드파티 저장소 하나를 덜 설치해도 되는 쪽을 택함.
3. **무음 클립 처리** — 사용자 지시: 검증하면서 필요하면 처리. `TJ_H3_AudioLock.lock()`은
   `audio is None`이면 즉시 에러(§ 소스 `h3_audio_lock.py:162-163`) — H3로 만든 클립은 항상
   오디오가 있어야 정상이라 실무에서 마주칠 일은 적어야 하지만, 실기기 검증 단계에서 무음 소스로
   한번 테스트해서 걸리면 `_encode_audio` 앞에 빈 파형(zeros, 짧은 sample_rate) 폴백을 추가.
   지금은 코드 변경 없음 — 구현 착수 시 테스트 케이스로만 등록.
4. ~~정확한 클래스명/시그니처~~ → **해결.** §3 전체가 소스 코드 확인 완료.
5. **VRAM 실측** — 아직 미실측. 구현 완료 후 `auto_capped_768` 기본값으로 실기기 테스트
   (아래 §10 순서 5번). README의 "cost = 캔버스² × 프레임수" 경고 외에 실측 수치 없음.

---

## 10. 구현 순서 (확정, 2026-09-12)

1. ~~로컬 설치 + 소스 확인~~ → **완료.** `ComfyUI-H3-FaceRefine`을 `custom_nodes/`에 클론,
   `nodes.py`/`picker_api.py` 전체 확인 완료(§3/§6/§9). `ComfyUI-H3-NativeAudioLock`은 §9-2
   결론에 따라 설치 불필요.
2. ~~가용성 리스트~~ → **완료.** `nodes.py` + `api_minimax.js` 둘 다 §7의 노드 추가.
3. ~~`buildFaceRefineGraph()`~~ → **완료 (랭킹 규칙 경로).** `graph_builder_minimax.js`.
   H3's 자체 unet/clip/vae + turbo/attention 체인을 `buildModelChain`/`buildConditioning`
   재사용(Reference 모드로 강제 코어스). 캔버스 크기/프레임수는 트래커 출력에서 **링크로**
   받음(리터럴 아님 — auto_capped_768 등 자동 모드가 그래프 실행 시점에만 실제 크기를 앎).
   **Manual Select 분기(`select==="manual"`→`H3FaceSelect`)는 그래프 빌더 안에 이미 구현돼
   있음** — `frConfirmedPick` state만 채워지면 바로 동작. 프런트 UI만 아직 없음(아래 5번).
4. ~~Settings → Models "H3 Face Refine" 패널~~ → **완료.** `ui_app_settings_minimax.js`
   (face_detector 필수 + fallback/SAM/CLIP Vision 선택), `nodes.py`
   `mmh3_get_models`/`mmh3_get_config`/`mmh3_save_config`에 `face_*` 키 추가
   (`_scan_ultralytics()` 헬퍼 — Impact Pack 없이도 `models/ultralytics/{bbox,segm}` 직접 스캔).
5. **부분 완료.** 좌측 패널 UI(`renderFaceRefineLeft`) + 단일 큐 실행(`runFaceRefine`, 세그먼트
   없음 — 프레임수가 트래커 출력이라 사전 분할 자체가 불가능) — 소스 카드/프롬프트/Face 선택
   (랭킹 규칙만)/Crop·Canvas/Denoise/Stitch 아코디언까지. **Pick Faces 모달(§6-B)은 아직
   미구현** — select 드롭다운에서 "manual"을 일부러 뺐다(그래프·상태는 준비됐지만 프런트가
   없어서 골라도 실행이 안 됨). 필요해지면 다음 라운드에서 붙이면 됨(백엔드는 이미 있음, §6-A).
6. 실기기 검증 (사용자가 메인 백엔드에서 직접 진행): 얼굴 작은 클립으로 리파인 전/후 비교,
   `auto_capped_768` VRAM 실측(§9-5), 무음 클립 케이스(§9-3), 랭킹 규칙 select 동작.
7. **완전 검증 끝난 뒤에만** 웹(AI_One_Studio)에 미러링 — 검증 전 포팅 금지(사용자 지시)

### 진행 방침 (사용자 지시, 2026-09-12)

- **UI는 지금 구현하되, 검증은 나중에** — 화면 확인은 사용자가 메인 백엔드에서 실제 GGUF 없는
  safetensors 조합으로 직접 테스트. 구현 단계에서는 오류 없이 짜는 데 집중하고, 불확실한 부분은
  이 문서에 계속 기록하며 진행(토큰 낭비 없이 — 이미 답이 나온 질문을 다시 조사하지 않기).
- ~~TJ_NODE 세션에 요청할 것 없음~~ → **틀렸음, 실제로 하나 나왔다 — §11.** "새 노드 개발은
  불필요"는 맞았지만, 기존 `TJ_H3_AudioLock`이 이 새로운 조합(VHS_LoadVideo 오디오 출력)에서
  실제로 깨지는 버그가 있었고 TJ_NODE가 패치했다. 스모크 테스트로 실제 큐에 올려보지 않았으면
  못 찾았을 버그 — "실기기 검증 전엔 모른다"는 게 그대로 증명된 사례.
- **웹 미러링은 검증 완료 후** — PORT_LEDGER.md에도 "구현 중, 미검증" 상태로만 기록하고, 실제
  포팅 요청은 실기기 검증이 끝난 뒤에 보낸다.

---

## 11. 스모크 테스트에서 발견·수정한 버그 (2026-09-12)

`buildFaceRefineGraph()`가 만드는 그래프를 손으로 재구성해 직접 `/prompt`에 큐잉해서 검증하는
과정에서 실제 버그를 하나 찾았다 — 이 스펙/그래프 설계가 아니라 **TJ_NODE의 기존
`TJ_H3_AudioLock`**(`nodes/video/h3_audio_lock.py`) 쪽 문제였다.

**증상**: `VHS_LoadVideo`의 AUDIO 출력(index 2)을 `TJ_H3_AudioLock.audio`에 연결하면 항상
`audio 입력이 비어 있거나 형식이 올바르지 않습니다` 에러.

**근본 원인**: `TJ_H3_AudioLock`은 지금까지 항상 코어 `LoadAudio`(바로 `dict` 반환)랑만 짝지어
써서, `_encode_audio()`가 `isinstance(audio, dict)`만 체크해도 문제가 없었다. 그런데
`VHS_LoadVideo`의 AUDIO 출력은 `comfyui-videohelpersuite`의 `LazyAudioMap` — `dict`가 아니라
`collections.abc.Mapping`을 구현한 지연평가 래퍼(`__getitem__` 호출 시점에 실제 오디오를 디코드).
Face Refine이 이 조합(VHS_LoadVideo → TJ_H3_AudioLock)을 처음 만든 케이스라 이번에 처음 드러남.

**시행착오**: 처음엔 "callable 래퍼"로 잘못 진단해 `if callable(audio): audio = audio()`를
제안했는데, `LazyAudioMap`은 callable이 아니라 `Mapping`이라 그 체크가 항상 False — 재검증에서
같은 에러가 그대로 나서 오진단임을 확인. `LazyAudioMap`의 실제 정의
(`comfyui-videohelpersuite/videohelpersuite/utils.py`)를 직접 읽고서야 정정: `isinstance(audio,
Mapping)`이면 `dict(audio)`로 변환. TJ_NODE가 정정된 수정을 반영 → 재검증 성공(§ 상단 상태 참고).

**교훈**: 노드 소스만 읽고 추정한 진단은 실제 실행 전까진 확정이 아니다 — 이번 것도 실제로 큐에
올려서 진짜 에러 메시지를 받아보고 나서야 두 번째 진단(Mapping)이 맞다는 게 확인됐다.

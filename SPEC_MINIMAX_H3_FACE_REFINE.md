# SPEC — H3 Face Refine (설계 문서, 구현 전)

**상태: 설계 단계.** 아직 코드 한 줄도 없다. 이 문서는 `github.com/Carasibana/ComfyUI-H3-FaceRefine`
(MIT, 2026-09 기준 v1.1.0)를 그대로 우리 STUDIO_ONE에 "완성된 H3 클립을 후처리하는 기능"으로
붙이기 위한 조사·설계 기록이다.

**출처**: 저 저장소의 README를 브라우저로 직접 읽고 정리했다 — 코드 자체(`nodes.py`)는 아직
보지 않았다. 아래 노드 스키마·입출력은 README에 문서화된 것을 그대로 옮긴 것이고, 실제 구현
착수 시 `nodes.py`를 직접 읽어 시그니처를 재확인해야 한다 (README와 실제 코드가 어긋나는 경우는
드물지만 항상 있을 수 있다).

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

---

## 2. 새 의존성

| 대상 | 이유 |
|---|---|
| `ComfyUI-H3-FaceRefine` (Carasibana, MIT) | 이 스펙의 핵심 노드 전부 |
| `ComfyUI-H3-NativeAudioLock` (Carasibana) | `MiniMaxH3NativeAudioLock` 공급 — 립싱크. **우리 자체 `TJ_H3_AudioLock`과 이름이 비슷하지만 완전히 다른 노드**, 혼동 주의 |
| `ComfyUI-Impact-Pack` | `ultralytics_bbox`/`ultralytics_segm`/`sams` 모델 폴더 등록 + `SAMLoader` 공급. FaceRefine 노드 자체의 하드 의존은 아니지만, 얼굴 검출기 드롭다운이 뜨려면 이 폴더 등록이 필요할 가능성이 높음 — **§9 열린 질문 1번** |
| `ultralytics`, `scipy`, `insightface`, `scenedetect` (Python pkg) | FaceRefine의 `requirements.txt`에서 자동 설치됨 |
| (선택) `ComfyUI-GGUF` | 이미 설치돼 있음 — FaceRefine 예제도 12GB 맞추려면 GGUF로 교체 권장 |

**모델 파일 (사용자가 직접 받아야 함)**:

| 모델 | 위치 | 용도 |
|---|---|---|
| `face_yolov8m.pt` (Bingsu/adetailer) | `models/ultralytics/bbox/` | 얼굴 검출 — **유일한 필수 모델** |
| `person_yolov8m-seg.pt` (선택) | `models/ultralytics/segm/` | 얼굴 검출 실패 프레임의 폴백 (몸통에서 머리 위치 추정) |
| SAM 모델 (선택) | `models/sams/` | 얼굴 모양 마스크 — 기본은 사각형 마스크로도 충분, README도 "대체로 사각형이 더 낫다"고 적어둠 |
| CLIP Vision (선택) | `models/clip_vision/` | identity_model=clip_vision — IPAdapter/Redux용으로 이미 있을 가능성 높음 |
| MiniMax H3 unet/clip/vae, 터보 LoRA | 이미 우리가 씀 | 그대로 재사용 |

anime/일러스트 얼굴은 `face_yolov8m.pt`가 못 잡을 수 있음 — 별도 애니메 얼굴 검출기 필요
(`deepghs/anime_face_detection` 등). 이건 사용자가 실제 소재를 보고 나중에 판단할 부분.

---

## 3. 노드 인벤토리 (README 기준)

카테고리: `MiniMax H3/Face Refine`

| 노드 | 입력 | 출력 | 비고 |
|---|---|---|---|
| **H3 Load Video + Face Select** (선택 프런트엔드) | `video`(경로/업로드), `detector`, `confidence`, `select`(manual 기본), `confirmed_pick`, `cut_detection`, `identity_reference` 등 | `images`, `audio`, `face_pick`, `preview`, `report`, `frame_count`, `fps` | 영상을 직접 로드하면서 얼굴 검출 + 컷 감지 + "어느 얼굴이 주인공인지"를 **그래프 실행 전에** 대화형으로 확정. `Pick faces` 팝업이 있음(샷마다 얼굴 번호 골라 클릭) — **우리 UI로 이식하려면 이 팝업이 가장 큰 UI 작업**. 없어도 동작(아래 트래커가 자체적으로 검출) |
| **H3 Face Track + Crop** | `images`, `detector`, `confidence`, `crop_factor`(2.5), `canvas_width/height`(768), `canvas_mode`(manual/auto_no_downscale/auto_capped_768), `smooth_window`(21), `select`(largest_face 등 9종), `identity_reference`, `cut_detection`, `face_pick`(위 노드에서) | `crops`, `transform`, `preview`, `report`, `canvas_w/h`, `frame_count` | 핵심 트래킹. `face_pick`이 연결되면 자체 검출은 생략(중복 방지) |
| **H3 Inject Video Latent** | `av_latent`(MiniMaxH3ReferenceToVideo의 LATENT), `images`(crops), `vae` | `av_latent`, `report` | **진짜 img2img 경로** — H3 공식 노드엔 없음. 위젯 없음, strength는 BasicScheduler의 denoise로 결정 |
| **H3 Per-Frame Denoise** | `model`(MiniMaxH3NativeAudioLock 이후), `av_latent`, `transform`, `denoise_multiplier_small_face`(1.0)/`_large_face`(0.35), `face_px_small`(30)/`_large`(120), `scale_mode`, `gamma`, `smooth_frames`(9) | `av_latent`, `report`, **`model`** | v1.1.0부터 MODEL을 받고 돌려줌 — 반드시 이 출력을 BasicGuider/BasicScheduler에 연결해야 함. 빼먹으면 에러 없이 조용히 효과가 죽음 |
| **H3 Face Mask (SAM)** (선택) | `crops`, `sam_model`, `transform`, `threshold`(0.93), `dilation`(0), `temporal_smooth`(5) | `masks`, `report` | 얼굴 모양 마스크. 기본 사각형 마스크로 시작 권장, 나중에 옵션으로 |
| **H3 Face Stitch Back** | `base_images`(원본), `refined_crops`(VAEDecode 결과), `transform`, `paste_region`(face_only/face_ellipse/full_crop), `feather`(6), `colour_match`(1.0), `blend`(1.0), `undetected_frames`(fade_out/skip/composite_anyway), `masks`(선택) | `images` | 최종 합성. 여기서 나온 `images`를 `CreateVideo`/`SaveVideo`로 |
| **H3 Face Transform Info** (디버그) | `transform`, `max_rows` | `info`(문자열, 그래프에 바로 표시) | 옵션 — 디버깅용, 그래프에 필수는 아님 |

---

## 4. 그래프 구성 (제안)

LTX Upscale(`buildLtxUpscaleGraph`, `graph_builder_minimax.js:839`)과 같은 패턴 —
"소스 클립 픽 → 별도 그래프 → 단일 큐 실행 → 갤러리 저장". 새 함수
`buildFaceRefineGraph(state, avail, opts)`로 신설.

```
G:load        VHS_LoadVideo(sourceFile)                       → images, frame_count, audio
                (Manual Select 대응 시 이 자리를 
                 H3 Load Video + Face Select로 교체 — §6)

G:track       H3 Face Track + Crop(images=G:load[0], detector, ...)
                → crops, transform, canvas_w, canvas_h, frame_count

               ── H3의 기존 레퍼런스 경로 그대로 재사용 ──
G:unet/clip/vae   UNETLoader / CLIPLoader / VAELoader(video+audio)   (이미 있는 헬퍼 재사용)
G:cond            MiniMaxH3ReferenceToVideo(refs=Ref1/Ref2, prompt,
                    width=[G:track,canvas_w], height=[G:track,canvas_h],
                    length=[G:track,frame_count])                   → av_latent(빈 latent)

G:inject      H3 Inject Video Latent(av_latent=[G:cond], images=[G:track,crops], vae)
                → av_latent(실제 프레임이 인코딩된 latent)

G:turbo       (선택) LoraLoaderModelOnly — 기존 터보 LoRA 체인 그대로

G:audiolock   MiniMaxH3NativeAudioLock(model, av_latent=[G:inject], audio=원본 오디오
                또는 별도 보컬 트랙)                                  → model, av_latent

G:denoise     H3 Per-Frame Denoise(model=[G:audiolock,model], av_latent=[G:audiolock,av_latent],
                transform=[G:track,transform], denoise_multiplier_*, face_px_*, ...)
                → av_latent, model   ← 이 model을 아래 둘에 연결해야 함

G:guider      BasicGuider(model=[G:denoise,model], conditioning=positive)
G:sched       BasicScheduler(model=[G:denoise,model], steps, denoise=0.40 기본)
G:sampler     SamplerCustomAdvanced(guider, sigmas=[G:sched], latent_image=[G:denoise,av_latent])

G:decode      VAEDecode(samples=[G:sampler], vae)                    → refined_crops(images)

G:stitch      H3 Face Stitch Back(base_images=[G:load,0], refined_crops=[G:decode],
                transform=[G:track,transform], paste_region, feather, colour_match, blend,
                undetected_frames)                                   → images(최종)

G:video       CreateVideo(images=[G:stitch], fps, audio=원본 오디오)
G:save        SaveVideo(video, filename_prefix=`${folder}/${stem}_FACEREFINE`)
```

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
  - **Manual pick(=Pick faces 팝업)은 1차 구현에서 제외 권장** — 대화형 얼굴-샷 매칭 UI는
    이 스펙만으로 별도 작업량이라, 처음엔 `select` 랭킹 규칙만으로 커버하고 필요하면 나중에 추가
- **Crop/Canvas 아코디언**: `crop_factor`(2.5), `canvas_mode`(auto_capped_768 기본 — VRAM 안전),
  `smooth_window`
- **Denoise 아코디언**: base denoise, `denoise_multiplier_small/large_face`, `face_px_small/large`
  — 기본값 그대로 노출, 필요할 때만 건드리게
- **Stitch 아코디언**: `paste_region`(face_only 기본), `feather`, `colour_match`, `blend`
- Settings → Models에 "H3 Face Refine" 패널 신설: `faceDetector`, `fallbackDetector`(선택),
  `samModel`(선택), `identityClipVision`(선택) — LTX 2.5 Upscale 패널과 같은 톤

---

## 6. Manual Select(Pick faces) — 나중 확장

README에 따르면 이 팩의 진짜 강점은 "누가 봐도 주인공이 아닌 얼굴"(군중, 두 번째로 큰 얼굴,
컷 넘나드는 인물)을 다룰 때다. `select=manual` + `H3 Load Video + Face Select`의 `Pick faces`
팝업(샷별 얼굴 카드에서 클릭)이 그 경로. 1차 구현에서는 스킵하고 랭킹 규칙(`largest_face` 등)
으로 커버 — 우리 H3 사용자층(1인 캐릭터 중심 영상)에서는 랭킹 규칙만으로 충분할 가능성이 높다.
필요해지면 별도 스펙으로 분리.

---

## 7. 가용성 리스트 반영 (양쪽 다 — 잊으면 "설치 안 됨" 오탐)

`project_mmh3_dual_availability_list` 메모 그대로 — **두 파일 다** 고쳐야 함:

- `nodes.py` `MMH3_OPTIONAL_NODES`
- `web/minimax/api_minimax.js` `MMH3_OPTIONAL_NODES`

추가할 노드: `H3LoadVideoFaceSelect`(가칭 — 실제 클래스명은 구현 시 `nodes.py` 원본에서 확인),
`H3FaceTrackCrop`, `H3InjectVideoLatent`, `H3PerFrameDenoise`, `H3FaceMaskSAM`, `H3FaceStitchBack`,
`H3FaceTransformInfo`, `MiniMaxH3NativeAudioLock`, 그리고 `SAMLoader`(Impact Pack, 선택 기능용).

---

## 8. 설치 스크립트 반영

`install_requirements.*` / `install_comfyui_dependencies.bat` 양쪽에:
- `ComfyUI-H3-FaceRefine` 클론
- `ComfyUI-H3-NativeAudioLock` 클론 (FaceRefine 저장소 안 `custom_nodes/ComfyUI-H3-NativeAudioLock`
  서브폴더를 별도 폴더로 복사해야 함 — README가 명시한 특이한 배치, 일반 git clone 한 줄로 안 됨)
- Impact Pack이 아직 설치 목록에 없다면 추가 검토 (얼굴 검출기 폴더 등록용 — §9 열린 질문 1번
  답에 따라 필수/선택 결정)
- `face_yolov8m.pt` 자동 다운로드는 하지 않음(다른 자동 모델 다운로드 사례와 동일 정책) — 대신
  누락 시 안내 배너에 "Bingsu/adetailer에서 받아 `models/ultralytics/bbox/`에 넣으세요" 텍스트

---

## 9. 열린 질문 (구현 착수 전 확인 필요)

1. **Impact Pack 없이 얼굴 검출기 드롭다운이 뜨는가?** README는 "노드 자체가 필요로 하는 건
   얼굴 검출기뿐"이라면서도 "Impact Pack의 서브팩이 `ultralytics_bbox`/`ultralytics` 폴더를
   등록한다"고 적음. `folder_paths`에 커스텀 폴더 키를 등록하는 주체가 Impact Pack인지
   FaceRefine 자신인지 `nodes.py` 원본을 읽어야 확정됨. Impact Pack이 필수면 설치 목록에 새로
   추가해야 함(우리 install 스크립트엔 아직 없음 — 확인 필요).
2. **`MiniMaxH3NativeAudioLock`과 우리 `TJ_H3_AudioLock`을 그래프에서 같이 쓸 수 있는가, 아니면
   교체해야 하는가?** 둘 다 "오디오를 AV latent에 고정"이라는 같은 역할이라 동시에 쓸 이유가
   없어 보이지만, FaceRefine의 `H3 Per-Frame Denoise`가 `MiniMaxH3NativeAudioLock` 뒤에 오는
   `model` 출력을 전제로 설계돼 있어서 그쪽 노드로 통일하는 게 맞을 가능성이 높음 — 구현 시
   실제 두 노드의 INPUT_TYPES를 비교해서 결정.
3. **원본 클립에 오디오가 없는 경우(무음 H3 클립)** `MiniMaxH3NativeAudioLock`이 오디오 입력을
   필수로 받는지 확인 필요 — 필수라면 무음 클립에 대해 빈/무음 오디오를 만들어 넣는 처리 필요.
4. **정확한 클래스명·FUNCTION·기본값**은 `ComfyUI-H3-FaceRefine/nodes.py`를 직접 읽어 이 문서의
   §3을 재확인 — 지금은 README 기준.
5. **캔버스 크기와 우리 16GB 타겟**: README는 "cost = 캔버스² × 프레임수"라고만 경고 — 실제
   VRAM 수치는 없음. `auto_capped_768` 기본으로 시작해서 실측 필요.

---

## 10. 구현 순서 제안

1. `ComfyUI-H3-FaceRefine` + `ComfyUI-H3-NativeAudioLock`을 로컬에 수동 설치, `nodes.py` 읽고
   §3/§9-1,2,3 확정
2. `buildFaceRefineGraph()` — 랭킹 규칙(select)만 지원하는 최소 그래프부터 (Manual pick 제외)
3. Settings → Models "H3 Face Refine" 패널 + 가용성 리스트 양쪽 반영
4. 좌측 패널 UI — 소스 카드 + Face/Crop/Denoise/Stitch 아코디언
5. 실기기 검증 — 얼굴 작은 클립으로 리파인 전/후 비교, VRAM 실측
6. (나중) Manual Select `Pick faces` 팝업 이식 — 별도 스펙

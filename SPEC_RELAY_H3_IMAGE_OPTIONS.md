# SPEC RELAY — H3 Image Generator 추가 기능 (웹 / Canvers 전달용, 노드 v1.53.0)

`SPEC_RELAY_H3_IMAGE_OFFICIAL.md`(공식 노드 교체)의 후속. 대상은 H3 Image Generator의 **Text to Image / Reference to Image**뿐이고 **Character Sheet은 수정 금지**. 서버(`nodes.py`) 변경 없음(재시작 불필요).
검증(이 PC, 노드): T2I를 Shift 켠 채/H3 prompt weight 켠 채 실제 큐에 올려 이미지 생성 확인, 결과 이미지 휠 확대·더블클릭 맞춤, Send to R2I, R2I 참조 없음 팝업을 화면에서 확인.

## 1. 결과 이미지 마우스 동작
- 결과 영역(이미지 표시 중 = 생성 중 미리보기, T2I/R2I 최종 결과): **휠 = 확대(커서 기준)**, **왼쪽 드래그 = 이동**, **더블클릭 = 맞춤**. 노드는 `web/shared/pan_zoom.js`의 `attachPanZoom(previewBox, () => [previewImg], { enabled: () => previewImg.style.display === "block" })`. 영상 결과에는 적용 안 함(이미지가 보일 때만 켜짐).
- ⛶ 전체화면 버튼이 이미지 결과에서도 나옴(이미지면 이미지 전체화면 뷰어, 영상이면 기존 영상 뷰어).

## 2. Sampling 패널 (T2I / R2I)
노드 `renderImageGenLeft`의 Steps 패널을 아래로 교체(툴팁 포함). 라벨: `Sampling`, `Sampler`(기본 `euler`), `Scheduler`(기본 `simple`), `Steps`(기본 6), `CFG`(기본 1), `Use Shift`(체크, 기본 꺼짐), 켜면 `Shift`(기본 3, 최소 0.01). 설명문: "Official MiniMax H3 Image nodes — one sampling pass at the chosen resolution. Template defaults: euler · simple · cfg 1 · 6 steps. Shift is off by default (the model's own shift is used); turn it on to patch the model with the H3 Sigma Shift node." 목록은 비디오 쪽과 같은 `SAMPLERS`/`SCHEDULERS`.
- 상태 키(defaultState): `imgSampler`("euler"), `imgScheduler`("simple"), `imgCfg`(1), `imgShiftOn`(false), `imgShift`(3).
- 그래프(`buildOfficialImageGraph`): KSampler `sampler_name/scheduler/cfg`를 이 값으로. Shift가 켜져 있으면 LoRA 체인 뒤·KSampler 앞에 노드 `IMGO:shift` 추가: `MiniMaxH3SigmaShift {model, shift_video: <Shift>, shift_audio: 3}`(이 노드가 없으면 `ModelSamplingAuraFlow {model, shift: <Shift>}`, 둘 다 없으면 오류). 꺼져 있으면 노드 없음.
- 메타/Reuse에 `imgSampler, imgScheduler, imgCfg, imgShiftOn, imgShift` 저장·복원.

## 3. H3 prompt weight (T2I 전용 토글)
- 체크박스 라벨 `H3 prompt weight`, **기본 켜짐**, 툴팁(마우스를 올리면): "Text to Image works better with a reference: when on, a 1024x1024 pure-black image (#000000, an Empty Image node) is added as reference image 0. Leave it on for better results; turn it off to send the prompt alone." 상태 키 `imgPromptWeight`(true). T2I 모드에서만 표시.
- 켜면 그래프에 노드 `IMGO:black` = `EmptyImage {width:1024, height:1024, batch_size:1, color:0}` 를 만들어 `MiniMaxH3ImageConditioning`의 `images.image_0`에 직접 연결(Resize 노드 없이). R2I에는 영향 없음. 메타에 `imgPromptWeight` 저장·복원.

## 4. R2I 참조 없음 경고 (R2I 전용 옵션)
- 체크박스 `Warn if no reference image`, 기본 켜짐, 툴팁: "Reference to Image needs at least one picture. When on, Generate shows a notice popup instead of running if no reference image is loaded; turn it off to run without one." 상태 키 `imgWarnNoRef`(true).
- 켜져 있고 참조 이미지가 0장일 때 Generate는 렌더하지 않고 팝업(오류 스타일): `Reference to Image needs at least one reference image — add a picture in the Reference Images box first (or turn off "Warn if no reference image" to run without one).` 꺼져 있으면 참조 없이 그대로 실행(그래프는 `buildOfficialImageGraph`의 `warnNoRef:false`로 오류를 던지지 않음).

## 5. T2I → R2I 보내기
- T2I **최종 결과** 이미지(미리보기 아님) 오른쪽 아래에 버튼 `➡ Send to R2I`(툴팁 "Use this picture as a reference image in Reference to Image"). 누르면 결과 파일(output)을 `copyOutputToInput`으로 input에 복사해 `imgRefImages`에 추가(9장 한도, 넘으면 팝업 "9 reference images max."), 그 칸 MP는 1.0으로 `imgRefImagesMp`에 추가, `imageGenMode = "ref2i"`로 전환하고 화면 갱신, 팝업 "Added as a reference image in Reference to Image.". R2I·영상·미리보기에서는 버튼을 숨김.
- 마지막 최종 결과의 `{filename, subfolder, type}`를 기억(`lastImgOut`)해서 쓴다.

## 6. 상태 키 요약 (`core_minimax.js` defaultState, 모두 새 허용 키)
`imgSampler, imgScheduler, imgCfg, imgShiftOn, imgShift, imgPromptWeight(true), imgWarnNoRef(true)` (+ 이전 명세의 `imgOfficialSteps, imgUnetT2i, imgUnetRef2i, imgClip, imgVae, imgAutoEnhance`).

// i18n.js — TJ Node ONE UI 언어 지원 (ko / en)
// Language is stored globally in localStorage — changing it triggers a page reload.

const LANG_KEY = "tj_lang";

export function getLang() {
  return localStorage.getItem(LANG_KEY) || "ko";
}

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

// ── Translations ──────────────────────────────────────────────────────────────
const KO = {
  // Node toolbar
  reset_tooltip:  "노드 초기화 (저장 데이터 삭제 후 기본값 복원)",
  reset_confirm:  "노드를 초기화하면 저장된 모든 설정과 이미지 경로가 삭제됩니다.\n계속하시겠습니까?",
  reset_done:     "노드가 초기화됐습니다.",
  help_tooltip:   "사용 설명서",

  // Settings
  lang_label:              "언어 / Language",
  lang_reload_note:        "언어 변경 후 페이지를 새로고침합니다.",
  model_override_slot:     "모델 오버라이드 슬롯",
  model_override_toggle:   "model_override / clip_override / vae_override 슬롯 활성화 (GGUF 자동 감지)",
  model_override_desc:     "활성화 시 노드에 연결된 Primitive 노드의 파일명을 사용합니다. .gguf 파일은 자동으로 GGUF 로더를 사용합니다.",
  refresh_models:          "↻ 모델 새로고침",

  // ZImage model settings panel
  model_settings_toggle:   "모델 설정",
  diffusion_model_label:   "디퓨전 모델 (z_image_turbo)",
  text_encoder_label:      "텍스트 인코더 (qwen_3_4b)",

  // LoRA
  lora_loading:   "불러오는 중…",
  lora_add:       "+ Add LoRA",
  lora_search:    "🔍 검색…",

  // BFS (Faceswap)
  bfs_lora_add:   "+ BFS LoRA 선택",
  bfs_lora_label: "BFS Face LoRA (1개)",
  bfs_lora_warn:  "⚠ FACESWAP 모드에서는 BFS Face LoRA 1개만 사용합니다. LoRA 슬롯에 BFS 전용 LoRA를 선택하세요.",

  // Inpaint canvas
  inpaint_hint:      "🖱 휠=줌  |  중간버튼/우클릭 드래그=이동",
  inpaint_apply:     "✓ 적용 & 닫기",
  inpaint_saving:    "저장 중…",
  inpaint_saved:     "마스크 저장 완료.",
  inpaint_save_err:  "저장 실패: ",
  inpaint_save_btn:  "💾 마스크 저장",
  inpaint_large_edit:"⤢ 크게 편집",
  inpaint_no_mask:   "마스크 영역을 브러시로 칠하세요 (자동 저장 실패).",

  // RE-BG
  rebg_edge_offset:    "Edge Offset: 마스크 경계를 + 확장 / − 축소 (px). 기본 0",
  rebg_edge_blur:      "Edge Blur: 마스크를 블러링해 경계를 부드럽게 (px). 기본 0",
  rebg_expansion:      "Expansion px  (0 = 배경만 재생성)",
  rebg_expansion_note: "ℹ Expansion은 OUTPAINT가 아닙니다. 서브젝트는 원본 위치 그대로 유지되며, 배경 영역만 px 단위로 넓혀 재생성합니다.",
  rebg_feather_note:   "Expansion px > 0 일 때만 유효 — 원본/확장 경계를 블렌딩",
  rebg_denoise_desc:   "1.0 = 완전히 새 배경 생성 / 낮을수록 원본 배경 색감 유지",
  inpaint_denoise_desc: "낮을수록 원본 맥락 유지 (권장: 0.7~0.9)",

  // Outpaint / validation errors
  err_no_source:   "소스 이미지를 업로드하세요.",
  err_no_expand:   "최소 한 방향의 확장값을 설정하세요.",

  // Model validation errors (ZImage)
  err_no_model:    "⚙ Settings에서 Diffusion Model을 먼저 선택하세요.",
  err_no_clip:     "⚙ Settings에서 Text Encoder를 먼저 선택하세요.",
  err_no_vae:      "⚙ Settings에서 VAE를 먼저 선택하세요.",

  // Model validation errors (Klein)
  klein_err_no_model: "⚙ Settings에서 Diffusion Model을 먼저 선택하세요.",

  // Klein KV button
  kv_btn_title:   "KV Cache 모드 전환",
  kv_state_label: (ov, isOn) => `KV Cache: ${ov} (현재 ${isOn ? "ON" : "OFF"}) — 클릭으로 전환`,

  // Help overlay titles
  help_title_zimage: "? Z-Image ONE STUDIO 사용 설명서",
  help_title_klein:  "? Flux.2 Klein ONE STUDIO (TJ) 사용 설명서",

  // ── Z-Image Help sections ──────────────────────────────────────────────────
  zhelp_s0_title: "📦 모델 다운로드 가이드",
  zhelp_s0_body:
`◆ Diffusion Model → models/diffusion_models/
 • z_image_turbo_bf16.safetensors (권장)
   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors
 전체 모델 목록: https://huggingface.co/Comfy-Org/z_image_turbo

◆ Text Encoder → models/text_encoders/
 • qwen_3_4b.safetensors
   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors

◆ VAE → models/vae/
 • ae.safetensors
   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors

◆ ControlNet → models/controlnet/
 • Z-Image-Turbo-Fun-Controlnet-Union.safetensors
   https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors

◆ Face Detector (Face Redraw용) → models/ultralytics/bbox/
 • face_yolov8m.pt
   https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt
 • face_yolov9c.pt
   https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov9c.pt

◆ BG Removal → models/background_removal/
 • BiRefNet-general.pth (권장)
   https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/BiRefNet-general.pth
 • BiRefNet-portrait.pth
   https://huggingface.co/ZhengPeng7/BiRefNet-portrait/resolve/main/BiRefNet-portrait.pth`,

  zhelp_s1_title: "개요",
  zhelp_s1_body:
`Z-Image ONE STUDIO (TJ)은 Z-Image Turbo (Flow-matching 모델) 전용 올인원 생성 노드입니다.
상단 모드 버튼으로 T2I / I2I / INPAINT / RE-BG / CONTROLNET / FACE REDRAW 를 전환하며,
오른쪽 프리뷰에서 결과를 확인하고 하단 Send to 버튼으로 다음 작업으로 바로 넘길 수 있습니다.`,

  zhelp_s2_title: "⚙ 초기 설정 (Settings)",
  zhelp_s2_body:
`우상단 ⚙ 버튼 → Settings 오버레이에서 아래를 반드시 설정하세요.
• Diffusion Model  — UNet 모델 선택 (models/diffusion_models/)
• Text Encoder     — CLIP 텍스트 인코더 선택 (models/text_encoders/)
• VAE              — VAE 모델 선택 (models/vae/)
• Negative Prompt  — 전 모드에 공통 적용할 부정 프롬프트
• Prompt Suffix    — 전 모드 프롬프트 끝에 자동 추가할 키워드
• Save Subfolder   — 저장 폴더 이름 (기본: z-image-one-tj)
설정은 자동 저장되며 ComfyUI 재시작 후에도 유지됩니다.`,

  zhelp_s3_title: "T2I — 텍스트→이미지",
  zhelp_s3_body:
`프롬프트로 이미지를 새로 생성합니다.
• Resolution Preset — 자주 쓰는 해상도 프리셋 또는 Custom으로 직접 입력
• Steps / CFG / Shift / Sampler / Scheduler — 샘플링 파라미터
• LoRA (최대 3개) — LoRA 파일 선택, 강도 조절, 트리거 워드 자동 감지
• Seed / Mode — Fixed(고정), Random(매번 랜덤), +1/-1(증감)
생성 후 Send to 버튼으로 → I2I / INPAINT / RE-BG / CONTROLNET / FACE REDRAW 로 전달 가능.`,

  zhelp_s4_title: "I2I — 이미지→이미지",
  zhelp_s4_body:
`소스 이미지를 참고해 변형 생성합니다.
• Source Image 업로드 또는 다른 모드에서 Send to → I2I 로 전달
• Denoise — 낮을수록 원본 유지(0.3~0.6), 높을수록 자유 변형(0.8~1.0)
• Compare 버튼(⇌) — ON 시 결과와 원본을 슬라이더로 비교 가능`,

  zhelp_s5_title: "INPAINT — 마스크 영역 재생성",
  zhelp_s5_body:
`이미지의 특정 영역만 프롬프트로 재생성합니다. DifferentialDiffusion 방식 사용.
• Source Image 업로드
• ✏ 마스크 수정하기 — 클릭 시 ComfyUI 기본 마스크 에디터 오픈.
  흰색(White) = 재생성할 영역 / 검은색(Black) = 유지할 영역
  저장 시 자동으로 마스크 이미지에 반영됩니다.
• 직접 업로드 — 외부 툴로 만든 마스크 PNG를 업로드하는 대안 방법
• Denoise — 0.7~0.9 권장. 낮을수록 원본 맥락 강하게 유지.
핵심: DifferentialDiffusion이 마스크 경계를 부드럽게 처리해 자연스러운 합성.`,

  zhelp_s6_title: "RE-BG — 배경 재생성 + 확장",
  zhelp_s6_body:
`RMBG로 서브젝트를 분리 후 배경만 완전 재생성합니다. 경계선 없음.
기존 Outpaint의 경계선 문제를 해결한 방식입니다.
• BG Removal Model — birefnet 등 설치된 배경제거 모델 선택
• Source Image 업로드
• Expansion px — Up/Down/Left/Right 각 방향으로 캔버스 확장 픽셀 지정.
  모두 0이면 배경만 재생성(크기 유지), 값 입력 시 해당 방향으로 확장 후 재생성.
• Edge Feathering — 확장 경계 블렌딩 강도 (px)
• Background Denoise — 1.0=완전히 새 배경(권장), 낮추면 원본 색감 참조
동작 원리:
  1. RMBG → 서브젝트 마스크 추출
  2. 확장된 캔버스 전체를 새 배경으로 재생성 (denoise=1)
  3. 서브젝트를 새 배경 위에 합성 → 경계선 없는 완성 이미지`,

  zhelp_s7_title: "CONTROLNET — 구조/자세 참조 생성",
  zhelp_s7_body:
`레퍼런스 이미지의 구조/자세/윤곽을 참고해 생성합니다.
• ControlNet Union Model — models/model_patches/ 의 모델 선택
• Reference Image 업로드
• Control Type — Depth(깊이), Canny(윤곽선), Pose(자세), HED, MLSD, None
• Strength — ControlNet 적용 강도 (0~1)
• Resolution — 전처리 해상도 (512~1024)
GetImageSize 노드로 레퍼런스 이미지 크기를 자동 감지해 latent 크기를 맞춥니다.`,

  zhelp_s8_title: "FACE REDRAW — 얼굴 재생성",
  zhelp_s8_body:
`Impact Pack의 FaceDetailer를 사용해 얼굴 영역만 정밀 재생성합니다.
• Face Detector — UltralyticsDetectorProvider용 모델 선택 (ultralytics/bbox/*.pt)
• Source Portrait — 대상 인물 이미지 업로드
• Threshold — 얼굴 감지 민감도 (낮을수록 더 많이 감지)
• Dilation px — 감지 마스크 팽창 픽셀
• Denoise — 얼굴 재생성 강도 (0.4~0.6 권장, 너무 높으면 원본과 달라짐)
• Feather px — 마스크 경계 블렌딩
사전 요구: ComfyUI Impact Pack 설치, ultralytics/bbox/ 에 감지 모델 필요.`,

  zhelp_s9_title: "공통 기능",
  zhelp_s9_body:
`⇌ Compare  — ON 시 보라색 강조. 생성 결과와 소스 이미지를 슬라이더로 비교.
             T2I 제외 전 모드에서 활성화 가능.
🗑 Unload   — 현재 로드된 모델을 VRAM/RAM에서 해제.
⚙ Settings — 모델 선택, 네거티브/접미사 프롬프트, 저장 설정.
🖼 Gallery  — 저장된 이미지 갤러리. 즐겨찾기, 메타데이터 재사용, 삭제,
             폴더 열기, 다른 모드로 Send to 기능 포함.
📋 Template — 저장된 프롬프트 템플릿 불러오기.
🔍 Expand   — 프롬프트를 전체 화면 에디터로 확장 편집.
Send to     — 생성 결과를 다른 모드의 소스 이미지로 바로 전달.
Output      — 👁 Preview(임시 저장) / 💾 Save(영구 저장) 전환.`,

  // ── Klein Help sections ────────────────────────────────────────────────────
  khelp_s0_title: "📦 모델 다운로드 가이드",
  khelp_s0_body:
`◆ Diffusion Model → models/diffusion_models/
 FLUX.2 [klein] 모델 (Black Forest Labs)
 https://huggingface.co/collections/black-forest-labs/flux2
 ⚠ 9B 모델은 HuggingFace 로그인 후 Non-Commercial License 동의 필요

◆ Text Encoder (9B 모델용) → models/text_encoders/
 https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/text_encoders

◆ Text Encoder (4B 모델용) → models/text_encoders/
 https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b/tree/main/split_files/text_encoders

◆ VAE → models/vae/
 https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/vae

◆ Faceswap LoRA → models/loras/
 • BFS Head Swap v1 (9b)
   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors
 • BFS Head Swap v1 (4b)
   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_4b.safetensors

◆ BG Removal → models/background_removal/
 https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal`,

  khelp_s1_title: "T2I — 텍스트→이미지",
  khelp_s1_body:
`텍스트 프롬프트로 이미지를 생성합니다.
• 해상도: 1024×1536 (세로) 기본 설정
• Steps/CFG/Sampler/Scheduler: 4/1/er_sde/simple 권장
• LoRA: 최대 3개 — Strength, Trigger Word 설정 가능`,

  khelp_s2_title: "I2I — 이미지→이미지",
  khelp_s2_body:
`소스 이미지를 기반으로 변형합니다.
• Denoise 0.5~0.75: 원본 형태 유지하며 스타일 변경
• Denoise 0.8~1.0: 대폭 변형`,

  khelp_s3_title: "EDIT — 멀티 레퍼런스 편집",
  khelp_s3_body:
`참조 이미지 1~5장으로 이미지를 생성합니다.
• Image 1: 주 참조 (필수)
• Add Ref Image 버튼으로 2~5번 참조 이미지 추가
• Size Source: 출력 크기를 Image 1 기준으로 맞춤`,

  khelp_s4_title: "PAINT — 인페인트",
  khelp_s4_body:
`이미지의 특정 영역을 재생성합니다.
• 소스 이미지 업로드 후 캔버스에서 마스크 직접 드로잉
• 보라색 = 재생성 영역 / 검정 = 유지 영역
• 브러시/지우개 전환, 크기 조절, 줌/팬 지원
• ⤢ 크게 편집: 전체 화면 팝업 에디터
• 💾 마스크 저장 후 Generate`,

  khelp_s5_title: "FACESWAP — 얼굴 교체",
  khelp_s5_body:
`Target(배경)의 얼굴을 Source 얼굴로 교체합니다.
• Faceswap 전용 LoRA를 설정에 구성하세요
• Denoise 1.0 권장 (완전 재생성)`,

  khelp_s6_title: "공통 기능",
  khelp_s6_body:
`⇌ Compare  — ON 시 보라색 강조. 생성 결과와 소스를 슬라이더로 비교.
             T2I 제외 전 모드에서 활성화 가능. 기본값 ON.
KV         — KV Cache 토글. 모델명에 'kv' 포함 시 Auto ON.
↺ Reset    — 노드 상태 초기화 (모든 설정 리셋).
🗑 Unload   — 현재 로드된 모델을 VRAM/RAM에서 해제.
⚙ Settings — 모델 선택, 네거티브/접미사 프롬프트, 저장 설정.
🖼 Gallery  — 저장된 이미지 갤러리. 즐겨찾기, 메타데이터, Send to 기능.
📋 Template — 저장된 프롬프트 템플릿 불러오기.
🔍 Expand   — 프롬프트를 전체 화면 에디터로 확장 편집.
Send to     — 생성 결과를 다른 모드의 소스 이미지로 전달.
Output      — 👁 Preview(임시) / 💾 Save(영구) 전환.`,

  // ── QE2511 Help sections ───────────────────────────────────────────────────
  qehelp_title: "❓ Help — Qwen Image Edit 2511 ONE STUDIO (TJ)",

  qehelp_s0_title: "📦 모델 다운로드 가이드",
  qehelp_s0_body:
`◆ Diffusion Model → models/diffusion_models/
 • Qwen2.5-VL-7B-Image-Edit-bf16.safetensors (권장)
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models
 • GGUF 경량 버전도 지원합니다 (models/diffusion_models/)
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models

◆ Text Encoder (CLIPLoader qwen_image) → models/text_encoders/
 • qwen2.5vl-7b-vis-encoder.safetensors
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/text_encoders

◆ VAE → models/vae/
 • ae.safetensors
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/vae

◆ Lightning LoRA (4스텝 고속 생성, 선택사항) → models/loras/
 • Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/loras

◆ BFS LoRA (Faceswap 필수) → models/loras/
 • BFS Face Swap LoRA for Qwen Image Edit 2511
   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap

◆ Camera Angle LoRA (ANGLE 모드, 선택사항) → models/loras/
 • 카메라 앵글 제어용 LoRA (⚙ Settings에서 설정)

◆ SeedVR2 (UPSCALE 모드) → models/diffusion_models/
 • SeedVR2 모델 필요 — ComfyUI Manager를 통해 설치 권장`,

  qehelp_s1_title: "개요",
  qehelp_s1_body:
`Qwen Image Edit 2511 ONE STUDIO (TJ)는 Qwen2.5-VL 기반 이미지 편집 모델 전용
올인원 생성 노드입니다.
상단 모드 버튼으로 T2I / I2I / EDIT / PAINT / FACESWAP / ANGLE / UPSCALE을 전환하며,
오른쪽 프리뷰에서 결과를 확인하고 하단 Send to 버튼으로 다음 작업으로 바로 넘길 수 있습니다.
⚠ 생성은 ComfyUI 상단 RUN이 아닌 노드 내 ▶ Generate 버튼으로 실행해야 합니다.`,

  qehelp_s2_title: "⚙ 초기 설정 (Settings)",
  qehelp_s2_body:
`우상단 ⚙ 버튼 → Settings 오버레이에서 아래를 반드시 설정하세요.
• Diffusion Model  — Qwen2.5-VL UNet 모델 선택 (models/diffusion_models/)
• Text Encoder     — CLIPLoader qwen_image 방식 인코더 (models/text_encoders/)
• VAE              — VAE 모델 선택 (models/vae/)
• Lightning LoRA   — 4스텝 고속 생성 LoRA (선택사항, Steps=4, CFG=1 자동 설정)
• Camera Angle LoRA — ANGLE 모드 전용 LoRA (선택사항)
• Negative Prompt  — 전 모드에 공통 적용할 부정 프롬프트
• Prompt Suffix    — 전 모드 프롬프트 끝에 자동 추가할 키워드
• Save Subfolder   — 저장 폴더 이름
💾 Save All로 서버에 저장되며 재시작 후에도 유지됩니다.`,

  qehelp_s3_title: "T2I — 텍스트→이미지",
  qehelp_s3_body:
`텍스트 프롬프트로 이미지를 새로 생성합니다.
• Resolution — 해상도 프리셋 또는 Custom으로 직접 입력
• Steps / CFG / Sampler / Scheduler — 샘플링 파라미터
  Lightning LoRA 활성화 시 Steps=4, CFG=1 자동 적용
• LoRA — 최대 3개 추가, Strength와 Trigger Word 설정 가능
• Seed — Fixed(고정), Random(매번 랜덤), +1/-1(증감)
생성 후 Send to 버튼으로 → Edit / I2I / Paint / Upscale로 전달 가능.`,

  qehelp_s4_title: "I2I — 이미지→이미지",
  qehelp_s4_body:
`소스 이미지를 참고해 변형 생성합니다.
• Source Image 업로드 또는 다른 모드에서 Send to → I2I로 전달
• Denoise — 낮을수록 원본 유지(0.3~0.6), 높을수록 자유 변형(0.8~1.0)
• Compare 버튼(⇌) — ON 시 결과와 원본을 슬라이더로 비교 가능`,

  qehelp_s5_title: "EDIT — 멀티 레퍼런스 편집",
  qehelp_s5_body:
`텍스트 프롬프트로 이미지를 편집합니다. 최대 3장의 참조 이미지를 사용할 수 있습니다.
• Image 1 (필수) — 주 참조 이미지 업로드
• Add Ref Image 버튼 — 추가 참조 이미지 2~3번 업로드 (최대 총 3장)
내부 구조: TextEncodeQwenImageEditPlus + FluxKontextImageScale +
FluxKontextMultiReferenceLatentMethod 공식 워크플로우 사용.
• 아웃페인트(확장) 기능도 이 모드에서 지원됩니다:
  패딩 방향/크기 설정 후 ▶ Generate로 캔버스를 확장합니다.`,

  qehelp_s6_title: "PAINT — 인페인트",
  qehelp_s6_body:
`이미지의 특정 영역만 프롬프트로 재생성합니다.
• Source Image 업로드
• ✏ 마스크 수정하기 — ComfyUI 기본 마스크 에디터 오픈
  흰색(White) = 재생성할 영역 / 검은색(Black) = 유지할 영역
• Denoise — 0.7~0.9 권장. 낮을수록 원본 맥락 강하게 유지.
• 직접 업로드 — 외부 툴로 만든 마스크 PNG를 업로드하는 대안 방법
생성 후 Send to 버튼으로 다른 모드로 전달 가능.`,

  qehelp_s7_title: "FACESWAP — 얼굴 교체",
  qehelp_s7_body:
`Target 이미지의 얼굴을 Source 얼굴로 교체합니다.
• Target Image — 배경/장면 이미지 업로드
• Source Face  — 얼굴 원본 이미지 업로드
• BFS LoRA 필수 — ⚙ Settings에서 BFS Face Swap LoRA를 먼저 선택하세요
• 기본 프롬프트가 자동으로 설정되지만 수정도 가능합니다
• Denoise 1.0 권장 (완전 재생성)`,

  qehelp_s8_title: "ANGLE — 카메라 앵글 조절",
  qehelp_s8_body:
`원본 이미지의 카메라 앵글을 3D 씬에서 직관적으로 조절합니다.
• Source Image 업로드
• H (수평/방위각) — 좌우 카메라 회전
• V (수직/고도각) — 상하 카메라 각도
• Z (줌)          — 카메라 거리/확대
컨트롤 조작: 선 위에서 클릭 후 홀드하여 드래그합니다.
• Camera Angle LoRA — ⚙ Settings에서 선택 (ANGLE 모드에서만 자동 적용)
생성 후 Send to → Edit / I2I / Paint / Upscale로 전달 가능.`,

  qehelp_s9_title: "UPSCALE — 고해상도 업스케일",
  qehelp_s9_body:
`SeedVR2로 이미지를 고해상도로 업스케일합니다.
• Source Image 업로드 또는 다른 모드에서 Send to → Upscale로 전달
• DiT 모델 선택 (SeedVR2 관련 모델)
• VAE 모델 선택
• 최대 4096px까지 지원
• Tile 크기와 Overlap 설정 가능
ComfyUI Manager를 통해 SeedVR2 관련 커스텀 노드를 먼저 설치하세요.`,

  qehelp_s10_title: "공통 기능 및 주의사항",
  qehelp_s10_body:
`⇌ Compare  — ON 시 보라색 강조. 생성 결과와 소스를 슬라이더로 비교.
             T2I 제외 전 모드에서 활성화 가능.
🗑 Unload   — 현재 로드된 모델을 VRAM/RAM에서 해제.
⚙ Settings — 모델 선택, Lightning/Angle LoRA, 네거티브/접미사 프롬프트, 저장 설정.
🖼 Gallery  — 저장된 이미지 갤러리. 즐겨찾기, 메타데이터 재사용, 삭제,
             폴더 열기, 다른 모드로 Send to 기능 포함.
📋 Template — 저장된 프롬프트 템플릿 불러오기.
🔍 Expand   — 프롬프트를 전체 화면 에디터로 확장 편집.
Send to     — 생성 결과를 다른 모드의 소스 이미지로 바로 전달.
Output      — 👁 Preview(임시 저장) / 💾 Save(영구 저장) 전환.
Model Override — ⚙ Settings에서 활성화 시 외부 모델/CLIP/VAE 노드 연결 가능.
⚠ 생성은 ComfyUI 상단 RUN이 아닌 노드 내 ▶ Generate 버튼으로 실행해야 합니다.
  RUN 실행 시 마지막 생성 이미지가 OUTPUT image 슬롯으로 출력됩니다.`,

  // ── Krea2 Help sections ────────────────────────────────────────────────────
  k2help_title: "❓ Help — Krea 2 ONE STUDIO (TJ)",

  k2help_s0_title: "📦 모델 다운로드 가이드",
  k2help_s0_body:
`◆ Diffusion Model → models/diffusion_models/
 • Krea 2 UNet 모델 (GGUF 포함)
   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/diffusion_models
   전체 목록: https://huggingface.co/Comfy-Org/Krea2

◆ Text Encoder (CLIP krea2) → models/text_encoders/
 • krea2_clip_encoder.safetensors
   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/text_encoders

◆ VAE → models/vae/
 • ae.safetensors
   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/vae

◆ Lightning LoRA (4스텝 고속 생성, 선택사항) → models/loras/
 • Krea2 Lightning LoRA
   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/loras

◆ SeedVR2 (UPSCALE 모드) → models/diffusion_models/
 • SeedVR2 모델 필요 — ComfyUI Manager를 통해 설치 권장`,

  k2help_s1_title: "개요",
  k2help_s1_body:
`Krea 2 ONE STUDIO (TJ)는 Krea AI의 이미지 생성 모델 전용 올인원 노드입니다.
상단 모드 버튼으로 T2I / I2I / UPSCALE을 전환하며,
오른쪽 프리뷰에서 결과를 확인하고 하단 Send to 버튼으로 다음 작업으로 전달합니다.
⚠ 생성은 ComfyUI 상단 RUN이 아닌 노드 내 ▶ Generate 버튼으로 실행해야 합니다.`,

  k2help_s2_title: "⚙ 초기 설정 (Settings)",
  k2help_s2_body:
`우상단 ⚙ 버튼 → Settings 오버레이에서 아래를 반드시 설정하세요.
• Diffusion Model  — Krea2 UNet 모델 선택 (models/diffusion_models/)
• Text Encoder     — CLIP krea2 인코더 선택 (models/text_encoders/)
• VAE              — VAE 모델 선택 (models/vae/)
• Lightning LoRA   — 4스텝 고속 생성 LoRA (선택사항, Steps=4, CFG=1 자동 설정)
• Negative Prompt  — 전 모드에 공통 적용할 부정 프롬프트
• Prompt Suffix    — 전 모드 프롬프트 끝에 자동 추가할 키워드
• Save Subfolder   — 저장 폴더 이름
💾 Save All로 서버에 저장되며 재시작 후에도 유지됩니다.`,

  k2help_s3_title: "T2I — 텍스트→이미지",
  k2help_s3_body:
`텍스트 프롬프트로 이미지를 새로 생성합니다.
• Resolution — 해상도 프리셋 또는 Custom으로 직접 입력
• Steps / CFG / Sampler / Scheduler — 샘플링 파라미터
  Lightning LoRA 활성화 시 Steps=4, CFG=1 자동 적용
• LoRA — 최대 3개 추가, Strength와 Trigger Word 설정 가능
• Seed — Fixed(고정), Random(매번 랜덤), +1/-1(증감)
생성 후 Send to → I2I / Upscale로 전달 가능.`,

  k2help_s4_title: "I2I — 이미지→이미지",
  k2help_s4_body:
`소스 이미지를 기반으로 변형 생성합니다.
• Source Image 업로드 또는 다른 모드에서 Send to → I2I로 전달
• Denoise — 낮을수록 원본 유지(0.3~0.6), 높을수록 자유 변형(0.8~1.0)
• Compare 버튼(⇌) — ON 시 결과와 원본을 슬라이더로 비교 가능
생성 후 Send to → Upscale로 전달 가능.`,

  k2help_s5_title: "UPSCALE — 고해상도 업스케일",
  k2help_s5_body:
`SeedVR2로 이미지를 고해상도로 업스케일합니다.
• Source Image 업로드 또는 다른 모드에서 Send to → Upscale로 전달
• DiT 모델 선택 (SeedVR2 관련 모델)
• VAE 모델 선택
• 최대 4096px까지 지원
ComfyUI Manager를 통해 SeedVR2 관련 커스텀 노드를 먼저 설치하세요.`,

  k2help_s6_title: "공통 기능 및 주의사항",
  k2help_s6_body:
`⇌ Compare  — ON 시 보라색 강조. 생성 결과와 소스를 슬라이더로 비교.
             T2I 제외 전 모드에서 활성화 가능.
🗑 Unload   — 현재 로드된 모델을 VRAM/RAM에서 해제.
⚙ Settings — 모델 선택, Lightning LoRA, 네거티브/접미사 프롬프트, 저장 설정.
🖼 Gallery  — 저장된 이미지 갤러리. 즐겨찾기, 메타데이터 재사용, 삭제,
             폴더 열기, 다른 모드로 Send to 기능 포함.
📋 Template — 저장된 프롬프트 템플릿 불러오기.
🔍 Expand   — 프롬프트를 전체 화면 에디터로 확장 편집.
Send to     — 생성 결과를 다른 모드의 소스 이미지로 바로 전달.
Output      — 👁 Preview(임시 저장) / 💾 Save(영구 저장) 전환.
Model Override — ⚙ Settings에서 활성화 시 외부 모델/CLIP/VAE 노드 연결 가능.
⚠ 생성은 ComfyUI 상단 RUN이 아닌 노드 내 ▶ Generate 버튼으로 실행해야 합니다.
  RUN 실행 시 마지막 생성 이미지가 OUTPUT image 슬롯으로 출력됩니다.`,

  // ── LLM Panel (Prompt Studio) ──────────────────────────────────────────────
  llm_tab_edit:            "✏️ 편집",
  llm_tab_enhance:         "✨ 강화",
  llm_tab_i2p:             "🖼 이미지→프롬프트",
  llm_lbl_gguf:            "GGUF 모델",
  llm_lbl_gpu_layers:      "GPU Layers",
  llm_lbl_ctx:             "컨텍스트 (n_ctx)",
  llm_lbl_max_tokens:      "최대 토큰",
  llm_lbl_temperature:     "Temperature",
  llm_lbl_seed:               "Seed",
  llm_lbl_model_format:       "Model Format",
  llm_lbl_aesthetic:          "Aesthetic",
  llm_lbl_extra_instructions: "Extra Instructions",
  llm_lbl_mmproj:             "mmproj 파일",
  llm_lbl_vision_task:        "Vision Task",
  llm_lbl_custom_instruction: "Custom Instruction",
  llm_lbl_image:              "이미지",
  llm_url_placeholder:        "이미지 URL 입력…",
  llm_btn_download:           "⬇ 다운로드",
  llm_btn_downloading:        "⏳ 다운로드 중…",
  llm_err_no_url:             "URL을 입력하세요.",
  llm_err_download:           "다운로드 실패: ",
  llm_img_size_note:          "※ LLM 처리를 위해 1MP 이하로 자동 축소됩니다.",
  llm_analyzing_overlay:      "AI 처리 중…",
  llm_btn_enhance:            "✨ 강화하기",
  llm_btn_enhancing:       "⏳ 실행 중…",
  llm_btn_analyze:         "🖼 분석하기",
  llm_btn_analyzing:       "⏳ 분석 중…",
  llm_enhance_placeholder: "현재 프롬프트를 LLM으로 강화합니다.\n왼쪽에서 모델을 설정하고 강화하기 버튼을 클릭하세요.",
  llm_result_title:        "📝 강화된 프롬프트",
  llm_btn_replace:         "교체하기",
  llm_btn_close:           "닫기",
  llm_img_drop:            "🖼 이미지 클릭 또는 드래그",
  llm_i2p_placeholder:     "이미지를 업로드하고 분석하기를 실행하면\n프롬프트가 여기에 생성됩니다.",
  llm_send_label:          "→ 현재 모드 프롬프트로 전송",
  llm_btn_send:            "전송 & 적용",
  llm_err_no_prompt:       "프롬프트를 먼저 입력하세요.",
  llm_err_no_image:        "이미지를 먼저 업로드하세요.",
  llm_err_prefix:          "LLM 오류: ",
  llm_not_installed_title: "TJ_NODE가 필요합니다",
  llm_not_installed_desc:  "LLM 기능을 사용하려면 TJ_NODE 확장을 설치해야 합니다.\n설치 후 ComfyUI를 재시작하면 자동으로 활성화됩니다.",
  llm_github_link:         "GitHub: designloves2/ComfyUI-TJ_NODE",
  llm_btn_install:         "⬇ 지금 설치하기",
  llm_installing:          "⏳ 설치 중… (git clone)",
  llm_install_progress:    "네트워크 상태에 따라 1~2분 소요될 수 있습니다.",
  llm_install_done:        "✅ 설치 완료 — ComfyUI를 재시작하세요",
  llm_btn_retry:           "⬇ 다시 시도",
  llm_err_network:         "네트워크 오류: ",
};

const EN = {
  reset_tooltip:  "Reset node (clear saved data & restore defaults)",
  reset_confirm:  "Resetting the node will delete all saved settings and image paths.\nContinue?",
  reset_done:     "Node has been reset.",
  help_tooltip:   "Help / User Guide",

  lang_label:              "언어 / Language",
  lang_reload_note:        "Page will reload after changing language.",
  model_override_slot:     "Model Override Slots",
  model_override_toggle:   "Enable model_override / clip_override / vae_override slots (GGUF auto-detect)",
  model_override_desc:     "When enabled, filenames from connected Primitive nodes take priority. .gguf files automatically use GGUF loaders.",
  refresh_models:          "↻ Refresh Models",

  model_settings_toggle:   "Model Settings",
  diffusion_model_label:   "Diffusion Model (z_image_turbo)",
  text_encoder_label:      "Text Encoder (qwen_3_4b)",

  lora_loading:   "Loading…",
  lora_add:       "+ Add LoRA",
  lora_search:    "🔍 Search…",

  bfs_lora_add:   "+ Select BFS LoRA",
  bfs_lora_label: "BFS Face LoRA (max 1)",
  bfs_lora_warn:  "⚠ Only 1 BFS Face LoRA is supported in FACESWAP mode. Select a BFS-dedicated LoRA in the slot.",

  inpaint_hint:      "🖱 Wheel=Zoom  |  Middle/Right drag=Pan",
  inpaint_apply:     "✓ Apply & Close",
  inpaint_saving:    "Saving…",
  inpaint_saved:     "Mask saved.",
  inpaint_save_err:  "Save failed: ",
  inpaint_save_btn:  "💾 Save Mask",
  inpaint_large_edit:"⤢ Large Edit",
  inpaint_no_mask:   "Paint the mask area with brush (auto-save failed).",

  rebg_edge_offset:    "Edge Offset: expand (+) or shrink (−) mask boundary (px). Default 0",
  rebg_edge_blur:      "Edge Blur: blur mask to soften boundary (px). Default 0",
  rebg_expansion:      "Expansion px  (0 = regenerate background only)",
  rebg_expansion_note: "ℹ Expansion ≠ Outpaint. The subject stays in place; only the background area is extended by the given px.",
  rebg_feather_note:   "Only applies when Expansion px > 0 — blends the original/expanded boundary",
  rebg_denoise_desc:   "1.0 = fully new background / lower values preserve original background colors",
  inpaint_denoise_desc: "Lower values preserve original context (recommended: 0.7~0.9)",

  err_no_source:   "Please upload a source image.",
  err_no_expand:   "Set at least one expansion direction.",

  err_no_model:    "⚙ Please select a Diffusion Model in Settings.",
  err_no_clip:     "⚙ Please select a Text Encoder in Settings.",
  err_no_vae:      "⚙ Please select a VAE in Settings.",

  klein_err_no_model: "⚙ Please select a Diffusion Model in Settings.",

  kv_btn_title:   "Toggle KV Cache mode",
  kv_state_label: (ov, isOn) => `KV Cache: ${ov} (currently ${isOn ? "ON" : "OFF"}) — click to cycle`,

  help_title_zimage: "? Z-Image ONE STUDIO User Guide",
  help_title_klein:  "? Flux.2 Klein ONE STUDIO (TJ) User Guide",

  // ── Z-Image Help sections ──────────────────────────────────────────────────
  zhelp_s0_title: "📦 Model Download Guide",
  zhelp_s0_body:
`◆ Diffusion Model → models/diffusion_models/
 • z_image_turbo_bf16.safetensors (recommended)
   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors
 Full model list: https://huggingface.co/Comfy-Org/z_image_turbo

◆ Text Encoder → models/text_encoders/
 • qwen_3_4b.safetensors
   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors

◆ VAE → models/vae/
 • ae.safetensors
   https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors

◆ ControlNet → models/controlnet/
 • Z-Image-Turbo-Fun-Controlnet-Union.safetensors
   https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union.safetensors

◆ Face Detector (for Face Redraw) → models/ultralytics/bbox/
 • face_yolov8m.pt
   https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt
 • face_yolov9c.pt
   https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov9c.pt

◆ BG Removal → models/background_removal/
 • BiRefNet-general.pth (recommended)
   https://huggingface.co/ZhengPeng7/BiRefNet/resolve/main/BiRefNet-general.pth
 • BiRefNet-portrait.pth
   https://huggingface.co/ZhengPeng7/BiRefNet-portrait/resolve/main/BiRefNet-portrait.pth`,

  zhelp_s1_title: "Overview",
  zhelp_s1_body:
`Z-Image ONE STUDIO (TJ) is an all-in-one generation node for Z-Image Turbo (flow-matching model).
Switch between T2I / I2I / INPAINT / RE-BG / CONTROLNET / FACE REDRAW using the mode buttons at the top.
View results in the right preview and pass them to the next workflow step via Send to buttons.`,

  zhelp_s2_title: "⚙ Initial Setup (Settings)",
  zhelp_s2_body:
`Click ⚙ (top-right) → Settings overlay and configure the following:
• Diffusion Model  — UNet model selection (models/diffusion_models/)
• Text Encoder     — CLIP text encoder (models/text_encoders/)
• VAE              — VAE model (models/vae/)
• Negative Prompt  — applied to all modes globally
• Prompt Suffix    — keywords appended to every prompt automatically
• Save Subfolder   — output folder name (default: z-image-one-tj)
Settings are saved automatically and persist across ComfyUI restarts.`,

  zhelp_s3_title: "T2I — Text to Image",
  zhelp_s3_body:
`Generate a new image from a text prompt.
• Resolution Preset — common presets or Custom for manual dimensions
• Steps / CFG / Shift / Sampler / Scheduler — sampling parameters
• LoRA (up to 3) — select LoRA files, adjust strength, auto-detect trigger words
• Seed / Mode — Fixed, Random, +1/-1 increment
After generation, use Send to → I2I / INPAINT / RE-BG / CONTROLNET / FACE REDRAW.`,

  zhelp_s4_title: "I2I — Image to Image",
  zhelp_s4_body:
`Generate a variation from a reference image.
• Upload Source Image or receive via Send to → I2I
• Denoise — lower values preserve original (0.3~0.6), higher values allow free variation (0.8~1.0)
• Compare button (⇌) — when ON, compare result and source with a slider`,

  zhelp_s5_title: "INPAINT — Masked Area Regeneration",
  zhelp_s5_body:
`Regenerate only the masked region using a prompt. Uses DifferentialDiffusion.
• Upload Source Image
• ✏ Edit Mask — opens ComfyUI's built-in mask editor.
  White = area to regenerate / Black = area to preserve
  Saved mask is automatically applied.
• Direct Upload — alternative: upload a mask PNG from an external tool
• Denoise — 0.7~0.9 recommended. Lower values keep original context stronger.
Key: DifferentialDiffusion smoothly handles mask edges for natural compositing.`,

  zhelp_s6_title: "RE-BG — Background Regeneration + Expansion",
  zhelp_s6_body:
`Separates subject with RMBG then fully regenerates the background. No edge artifacts.
This solves the border artifacts common in traditional Outpaint.
• BG Removal Model — select an installed background removal model (BiRefNet etc.)
• Upload Source Image
• Expansion px — specify canvas expansion per direction (Up/Down/Left/Right).
  All 0 = regenerate background only (same canvas size). Non-zero values expand then regenerate.
• Edge Feathering — blending strength at the expanded boundary (px)
• Background Denoise — 1.0 = fully new background (recommended), lower preserves original colors
How it works:
  1. RMBG → extract subject mask
  2. Regenerate entire expanded canvas as new background (denoise=1)
  3. Composite subject onto new background → seamless final image`,

  zhelp_s7_title: "CONTROLNET — Structure / Pose Reference",
  zhelp_s7_body:
`Generate using the structure, pose, or outlines of a reference image.
• ControlNet Union Model — select model from models/model_patches/
• Upload Reference Image
• Control Type — Depth, Canny, Pose, HED, MLSD, None
• Strength — ControlNet influence strength (0~1)
• Resolution — preprocessor resolution (512~1024)
GetImageSize node auto-detects reference image size to match latent dimensions.`,

  zhelp_s8_title: "FACE REDRAW — Face Regeneration",
  zhelp_s8_body:
`Uses Impact Pack's FaceDetailer to precisely regenerate the face region only.
• Face Detector — select model for UltralyticsDetectorProvider (ultralytics/bbox/*.pt)
• Source Portrait — upload the portrait image
• Threshold — face detection sensitivity (lower = more detections)
• Dilation px — expand detection mask by this many pixels
• Denoise — face regeneration strength (0.4~0.6 recommended; too high diverges from original)
• Feather px — mask edge blending
Prerequisites: ComfyUI Impact Pack installed, detection model in ultralytics/bbox/.`,

  zhelp_s9_title: "Common Features",
  zhelp_s9_body:
`⇌ Compare  — When ON (purple highlight), compare result and source with a slider.
             Available in all modes except T2I.
🗑 Unload   — Release currently loaded models from VRAM/RAM.
⚙ Settings — Model selection, negative/suffix prompts, save settings.
🖼 Gallery  — Image gallery with favorites, metadata reuse, delete,
             open folder, and Send to other modes.
📋 Template — Load saved prompt templates.
🔍 Expand   — Open full-screen prompt editor.
Send to     — Pass generation result directly to another mode as source.
Output      — 👁 Preview (temp) / 💾 Save (permanent) toggle.`,

  // ── Klein Help sections ────────────────────────────────────────────────────
  khelp_s0_title: "📦 Model Download Guide",
  khelp_s0_body:
`◆ Diffusion Model → models/diffusion_models/
 FLUX.2 [klein] models (Black Forest Labs)
 https://huggingface.co/collections/black-forest-labs/flux2
 ⚠ 9B model requires HuggingFace login and Non-Commercial License agreement

◆ Text Encoder (for 9B model) → models/text_encoders/
 https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/text_encoders

◆ Text Encoder (for 4B model) → models/text_encoders/
 https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-4b/tree/main/split_files/text_encoders

◆ VAE → models/vae/
 https://huggingface.co/Comfy-Org/vae-text-encorder-for-flux-klein-9b/tree/main/split_files/vae

◆ Faceswap LoRA → models/loras/
 • BFS Head Swap v1 (9b)
   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors
 • BFS Head Swap v1 (4b)
   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/blob/main/bfs_head_v1_flux-klein_4b.safetensors

◆ BG Removal → models/background_removal/
 https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal`,

  khelp_s1_title: "T2I — Text to Image",
  khelp_s1_body:
`Generate an image from a text prompt.
• Resolution: 1024×1536 (portrait) by default
• Steps/CFG/Sampler/Scheduler: 4/1/er_sde/simple recommended
• LoRA: up to 3 — configure Strength and Trigger Word`,

  khelp_s2_title: "I2I — Image to Image",
  khelp_s2_body:
`Transform an image based on a source reference.
• Denoise 0.5~0.75: style change while preserving original structure
• Denoise 0.8~1.0: significant transformation`,

  khelp_s3_title: "EDIT — Multi-Reference Editing",
  khelp_s3_body:
`Generate an image using 1~5 reference images.
• Image 1: primary reference (required)
• Add additional references (2~5) via Add Ref Image button
• Size Source: match output size to Image 1`,

  khelp_s4_title: "PAINT — Inpaint",
  khelp_s4_body:
`Regenerate a specific region of an image.
• Upload source image then draw mask directly on the canvas
• Purple = area to regenerate / Black = area to preserve
• Brush/eraser toggle, size control, zoom/pan supported
• ⤢ Large Edit: full-screen popup editor
• 💾 Save mask then Generate`,

  khelp_s5_title: "FACESWAP — Face Replacement",
  khelp_s5_body:
`Replace the face in Target (scene) with the Source face.
• Configure Faceswap-dedicated LoRA in settings
• Denoise 1.0 recommended (full regeneration)`,

  khelp_s6_title: "Common Features",
  khelp_s6_body:
`⇌ Compare  — When ON (purple highlight), compare result and source with a slider.
             Available in all modes except T2I. Default ON.
KV         — KV Cache toggle. Auto-ON when model name contains 'kv'.
↺ Reset    — Reset node state (all settings cleared).
🗑 Unload   — Release currently loaded models from VRAM/RAM.
⚙ Settings — Model selection, negative/suffix prompts, save settings.
🖼 Gallery  — Image gallery with favorites, metadata, Send to support.
📋 Template — Load saved prompt templates.
🔍 Expand   — Open full-screen prompt editor.
Send to     — Pass generation result to another mode as source.
Output      — 👁 Preview (temp) / 💾 Save (permanent) toggle.`,

  // ── QE2511 Help sections ───────────────────────────────────────────────────
  qehelp_title: "❓ Help — Qwen Image Edit 2511 ONE STUDIO (TJ)",

  qehelp_s0_title: "📦 Model Download Guide",
  qehelp_s0_body:
`◆ Diffusion Model → models/diffusion_models/
 • Qwen2.5-VL-7B-Image-Edit-bf16.safetensors (recommended)
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models
 • GGUF quantized versions also supported (models/diffusion_models/)
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/diffusion_models

◆ Text Encoder (CLIPLoader qwen_image) → models/text_encoders/
 • qwen2.5vl-7b-vis-encoder.safetensors
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/text_encoders

◆ VAE → models/vae/
 • ae.safetensors
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/vae

◆ Lightning LoRA (4-step fast generation, optional) → models/loras/
 • Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors
   https://huggingface.co/Comfy-Org/Qwen2.5-VL-7B-Image-Edit/tree/main/split_files/loras

◆ BFS LoRA (required for Faceswap) → models/loras/
 • BFS Face Swap LoRA for Qwen Image Edit 2511
   https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap

◆ Camera Angle LoRA (ANGLE mode, optional) → models/loras/
 • Select in ⚙ Settings under Camera Angle LoRA

◆ SeedVR2 (UPSCALE mode) → models/diffusion_models/
 • Install via ComfyUI Manager (SeedVR2 custom nodes required)`,

  qehelp_s1_title: "Overview",
  qehelp_s1_body:
`Qwen Image Edit 2511 ONE STUDIO (TJ) is an all-in-one generation node
for the Qwen2.5-VL image editing model.
Switch between T2I / I2I / EDIT / PAINT / FACESWAP / ANGLE / UPSCALE using the top mode buttons.
View results in the right preview and pass them to the next step via Send to buttons.
⚠ Always use the ▶ Generate button inside the node — NOT the ComfyUI RUN button at the top.`,

  qehelp_s2_title: "⚙ Initial Setup (Settings)",
  qehelp_s2_body:
`Click ⚙ (top-right) → Settings overlay and configure the following:
• Diffusion Model  — Qwen2.5-VL UNet model (models/diffusion_models/)
• Text Encoder     — CLIPLoader qwen_image encoder (models/text_encoders/)
• VAE              — VAE model (models/vae/)
• Lightning LoRA   — 4-step fast LoRA (optional, auto-sets Steps=4, CFG=1)
• Camera Angle LoRA — For ANGLE mode only (optional)
• Negative Prompt  — Applied globally to all modes
• Prompt Suffix    — Keywords auto-appended to every prompt
• Save Subfolder   — Output folder name
Click 💾 Save All to persist settings across ComfyUI restarts.`,

  qehelp_s3_title: "T2I — Text to Image",
  qehelp_s3_body:
`Generate a new image from a text prompt.
• Resolution — preset options or Custom for manual dimensions
• Steps / CFG / Sampler / Scheduler — sampling parameters
  Lightning LoRA active: Steps=4, CFG=1 auto-applied
• LoRA — up to 3, configure Strength and Trigger Word per LoRA
• Seed — Fixed, Random, +1/-1 increment
After generation, use Send to → Edit / I2I / Paint / Upscale.`,

  qehelp_s4_title: "I2I — Image to Image",
  qehelp_s4_body:
`Generate a variation from a reference image.
• Upload Source Image or receive via Send to → I2I
• Denoise — lower values preserve original (0.3~0.6), higher values allow free variation (0.8~1.0)
• Compare button (⇌) — when ON, compare result and source with a slider`,

  qehelp_s5_title: "EDIT — Multi-Reference Editing",
  qehelp_s5_body:
`Edit images using text prompts with up to 3 reference images.
• Image 1 (required) — upload primary reference image
• Add Ref Image button — add extra reference images 2–3 (up to 3 total)
Uses: TextEncodeQwenImageEditPlus + FluxKontextImageScale +
FluxKontextMultiReferenceLatentMethod official workflow internally.
• Outpaint (canvas expansion) is also supported in this mode:
  Set padding direction/size and click ▶ Generate to expand the canvas.`,

  qehelp_s6_title: "PAINT — Inpaint",
  qehelp_s6_body:
`Regenerate only the masked region of an image using a prompt.
• Upload Source Image
• ✏ Edit Mask — opens ComfyUI's built-in mask editor
  White = area to regenerate / Black = area to preserve
• Denoise — 0.7~0.9 recommended. Lower values keep original context stronger.
• Direct Upload — alternative: upload a mask PNG from an external tool
After generation, use Send to buttons to pass to another mode.`,

  qehelp_s7_title: "FACESWAP — Face Replacement",
  qehelp_s7_body:
`Replace the face in a Target image with a Source face.
• Target Image — upload the background/scene image
• Source Face  — upload the face reference image
• BFS LoRA required — select a BFS Face Swap LoRA in ⚙ Settings first
• Default prompt is auto-filled but can be edited
• Denoise 1.0 recommended (full regeneration)`,

  qehelp_s8_title: "ANGLE — Camera Angle Control",
  qehelp_s8_body:
`Intuitively control the camera angle of a scene in 3D space.
• Upload Source Image
• H (Horizontal / Azimuth) — rotate camera left/right
• V (Vertical / Elevation) — tilt camera up/down
• Z (Zoom)                 — camera distance / zoom level
Control operation: click and hold on the control line, then drag.
• Camera Angle LoRA — select in ⚙ Settings (auto-applied only in ANGLE mode)
After generation, use Send to → Edit / I2I / Paint / Upscale.`,

  qehelp_s9_title: "UPSCALE — High-Resolution Upscaling",
  qehelp_s9_body:
`Upscale images to high resolution using SeedVR2.
• Upload Source Image or receive via Send to → Upscale
• Select DiT model (SeedVR2 related)
• Select VAE model
• Supports up to 4096px
• Tile size and Overlap settings available
Install SeedVR2-related custom nodes via ComfyUI Manager first.`,

  qehelp_s10_title: "Common Features & Notes",
  qehelp_s10_body:
`⇌ Compare  — When ON (purple highlight), compare result and source with a slider.
             Available in all modes except T2I.
🗑 Unload   — Release currently loaded models from VRAM/RAM.
⚙ Settings — Model selection, Lightning/Angle LoRA, negative/suffix prompts, save settings.
🖼 Gallery  — Image gallery with favorites, metadata reuse, delete,
             open folder, and Send to other modes.
📋 Template — Load saved prompt templates.
🔍 Expand   — Open full-screen prompt editor.
Send to     — Pass generation result directly to another mode as source.
Output      — 👁 Preview (temp) / 💾 Save (permanent) toggle.
Model Override — Enable in ⚙ Settings to connect external model/CLIP/VAE nodes.
⚠ Always use ▶ Generate inside the node — NOT the ComfyUI RUN button.
  Running via RUN outputs the last generated image to the OUTPUT image slot.`,

  // ── Krea2 Help sections ────────────────────────────────────────────────────
  k2help_title: "❓ Help — Krea 2 ONE STUDIO (TJ)",

  k2help_s0_title: "📦 Model Download Guide",
  k2help_s0_body:
`◆ Diffusion Model → models/diffusion_models/
 • Krea 2 UNet model (GGUF also supported)
   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/diffusion_models
   Full model list: https://huggingface.co/Comfy-Org/Krea2

◆ Text Encoder (CLIP krea2) → models/text_encoders/
 • krea2_clip_encoder.safetensors
   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/text_encoders

◆ VAE → models/vae/
 • ae.safetensors
   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/vae

◆ Lightning LoRA (4-step fast generation, optional) → models/loras/
 • Krea2 Lightning LoRA
   https://huggingface.co/Comfy-Org/Krea2/tree/main/split_files/loras

◆ SeedVR2 (UPSCALE mode) → models/diffusion_models/
 • Install via ComfyUI Manager (SeedVR2 custom nodes required)`,

  k2help_s1_title: "Overview",
  k2help_s1_body:
`Krea 2 ONE STUDIO (TJ) is an all-in-one generation node for Krea AI's image generation model.
Switch between T2I / I2I / UPSCALE using the top mode buttons.
View results in the right preview and pass them to the next step via Send to buttons.
⚠ Always use the ▶ Generate button inside the node — NOT the ComfyUI RUN button at the top.`,

  k2help_s2_title: "⚙ Initial Setup (Settings)",
  k2help_s2_body:
`Click ⚙ (top-right) → Settings overlay and configure the following:
• Diffusion Model  — Krea2 UNet model (models/diffusion_models/)
• Text Encoder     — CLIP krea2 encoder (models/text_encoders/)
• VAE              — VAE model (models/vae/)
• Lightning LoRA   — 4-step fast LoRA (optional, auto-sets Steps=4, CFG=1)
• Negative Prompt  — Applied globally to all modes
• Prompt Suffix    — Keywords auto-appended to every prompt
• Save Subfolder   — Output folder name
Click 💾 Save All to persist settings across ComfyUI restarts.`,

  k2help_s3_title: "T2I — Text to Image",
  k2help_s3_body:
`Generate a new image from a text prompt.
• Resolution — preset options or Custom for manual dimensions
• Steps / CFG / Sampler / Scheduler — sampling parameters
  Lightning LoRA active: Steps=4, CFG=1 auto-applied
• LoRA — up to 3, configure Strength and Trigger Word per LoRA
• Seed — Fixed, Random, +1/-1 increment
After generation, use Send to → I2I / Upscale.`,

  k2help_s4_title: "I2I — Image to Image",
  k2help_s4_body:
`Generate a variation from a reference image.
• Upload Source Image or receive via Send to → I2I
• Denoise — lower values preserve original (0.3~0.6), higher values allow free variation (0.8~1.0)
• Compare button (⇌) — when ON, compare result and source with a slider
After generation, use Send to → Upscale.`,

  k2help_s5_title: "UPSCALE — High-Resolution Upscaling",
  k2help_s5_body:
`Upscale images to high resolution using SeedVR2.
• Upload Source Image or receive via Send to → Upscale
• Select DiT model (SeedVR2 related)
• Select VAE model
• Supports up to 4096px
Install SeedVR2-related custom nodes via ComfyUI Manager first.`,

  k2help_s6_title: "Common Features & Notes",
  k2help_s6_body:
`⇌ Compare  — When ON (purple highlight), compare result and source with a slider.
             Available in all modes except T2I.
🗑 Unload   — Release currently loaded models from VRAM/RAM.
⚙ Settings — Model selection, Lightning LoRA, negative/suffix prompts, save settings.
🖼 Gallery  — Image gallery with favorites, metadata reuse, delete,
             open folder, and Send to other modes.
📋 Template — Load saved prompt templates.
🔍 Expand   — Open full-screen prompt editor.
Send to     — Pass generation result directly to another mode as source.
Output      — 👁 Preview (temp) / 💾 Save (permanent) toggle.
Model Override — Enable in ⚙ Settings to connect external model/CLIP/VAE nodes.
⚠ Always use ▶ Generate inside the node — NOT the ComfyUI RUN button.
  Running via RUN outputs the last generated image to the OUTPUT image slot.`,

  // ── LLM Panel (Prompt Studio) ──────────────────────────────────────────────
  llm_tab_edit:            "✏️ Edit",
  llm_tab_enhance:         "✨ Enhance",
  llm_tab_i2p:             "🖼 Image→Prompt",
  llm_lbl_gguf:            "GGUF Model",
  llm_lbl_gpu_layers:      "GPU Layers",
  llm_lbl_ctx:             "Context (n_ctx)",
  llm_lbl_max_tokens:      "Max Tokens",
  llm_lbl_temperature:     "Temperature",
  llm_lbl_seed:               "Seed",
  llm_lbl_model_format:       "Model Format",
  llm_lbl_aesthetic:          "Aesthetic",
  llm_lbl_extra_instructions: "Extra Instructions",
  llm_lbl_mmproj:             "mmproj File",
  llm_lbl_vision_task:        "Vision Task",
  llm_lbl_custom_instruction: "Custom Instruction",
  llm_lbl_image:              "Image",
  llm_url_placeholder:        "Enter image URL…",
  llm_btn_download:           "⬇ Download",
  llm_btn_downloading:        "⏳ Downloading…",
  llm_err_no_url:             "Please enter a URL.",
  llm_err_download:           "Download failed: ",
  llm_img_size_note:          "※ Auto-resized to ≤1MP for LLM processing.",
  llm_analyzing_overlay:      "AI Processing…",
  llm_btn_enhance:            "✨ Enhance",
  llm_btn_enhancing:       "⏳ Running…",
  llm_btn_analyze:         "🖼 Analyze",
  llm_btn_analyzing:       "⏳ Analyzing…",
  llm_enhance_placeholder: "Current prompt will be enhanced by LLM.\nConfigure model on the left and click Enhance.",
  llm_result_title:        "📝 Enhanced Prompt",
  llm_btn_replace:         "Replace",
  llm_btn_close:           "Close",
  llm_img_drop:            "🖼 Click or drag image here",
  llm_i2p_placeholder:     "Upload an image and click Analyze\nto generate a prompt here.",
  llm_send_label:          "→ Send to current mode prompt",
  llm_btn_send:            "Send & Apply",
  llm_err_no_prompt:       "Please enter a prompt first.",
  llm_err_no_image:        "Please upload an image first.",
  llm_err_prefix:          "LLM error: ",
  llm_not_installed_title: "TJ_NODE Required",
  llm_not_installed_desc:  "TJ_NODE extension must be installed to use LLM features.\nRestart ComfyUI after installation to activate automatically.",
  llm_github_link:         "GitHub: designloves2/ComfyUI-TJ_NODE",
  llm_btn_install:         "⬇ Install Now",
  llm_installing:          "⏳ Installing… (git clone)",
  llm_install_progress:    "This may take 1–2 minutes depending on network speed.",
  llm_install_done:        "✅ Installed — please restart ComfyUI",
  llm_btn_retry:           "⬇ Retry",
  llm_err_network:         "Network error: ",
};

const STRINGS = { ko: KO, en: EN };

export function t(key, ...args) {
  const lang = getLang();
  const val = STRINGS[lang]?.[key] ?? STRINGS.ko[key] ?? key;
  return typeof val === "function" ? val(...args) : val;
}

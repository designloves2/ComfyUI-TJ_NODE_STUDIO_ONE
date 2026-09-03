═══════════════════════════════════════════════════════════════════════════════
 아래 한 줄만 본인 상황에 맞게 고치고, 전체를 Claude Code 또는 Codex 에 붙여넣으세요.
═══════════════════════════════════════════════════════════════════════════════

설치 유형 = 포터블            ← "포터블" 또는 "데스크탑" 중 하나로
설치 위치 = D:\ComfyUI        ← ComfyUI를 둘(또는 이미 있는) 폴더
웹앱 위치 = D:\AI-ONE-STUDIO  ← AI-ONE-STUDIO 웹앱을 둘 폴더
ComfyUI 포트 = 8188

───────────────────────────────────────────────────────────────────────────────

당신은 이 Windows PC에 ComfyUI + "TJ NODE ONE STUDIO" 커스텀 노드 팩 + 웹앱(AI-ONE-STUDIO)을
설치합니다. 위 4줄이 유일한 입력입니다. **사용자가 직접 하는 것은 모델 파일 다운로드뿐입니다.**
각 단계 시작 전에 무엇을 할지 한 줄로 알리고, 되돌리기 어려운 작업(기존 폴더 삭제 등) 전에는
사용자 확인을 받으세요.

════════════════ A. ComfyUI 설치 ════════════════

■ "설치 유형 = 포터블" 인 경우
  1. `설치 위치`가 없으면 만듭니다. 그 안에 ComfyUI-Easy-Install(Tavris1)을 받습니다:
     - https://github.com/Tavris1/ComfyUI-Easy-Install/releases/latest/download/ComfyUI-Easy-Install.zip
     - 다운로드한 zip은 `Unblock-File`로 차단 해제 후 `설치 위치`에 압축 해제.
       (이 배포판은 git·Python·ComfyUI 포터블을 전부 포함합니다. 별도 git/python 설치 불필요.)
  2. `<설치 위치>\ComfyUI-EZi.bat`(또는 릴리스에 포함된 부트스트랩)을 실행해 ComfyUI 본체를
     설치/갱신합니다. 대화형 메뉴가 뜨고 자동 진행되지 않으면, 사용자에게 "EZi 창에서
     ComfyUI 설치를 완료한 뒤 알려달라"고 요청하고 대기하세요.
  3. `<설치 위치>\Add-Ons\Insightface.bat` 와
     `<설치 위치>\Add-Ons\SageAttention-Multi (v2.2.0 and v3).bat` 를 순서대로 실행합니다.
     - 실행 전 ComfyUI가 떠 있으면 종료. 두 스크립트는 각자 py/torch/cuda 버전을 감지해
       맞는 wheel을 설치합니다.
     - GUI 대화상자나 키 입력을 요구해 자동 진행이 막히면, 그 스크립트만 사용자에게
       "이 창에서 진행해달라"고 넘기고 다음 단계로 가세요(이 둘은 사용자가 직접 눌러도 됨).
  4. 이후 <COMFY> = `<설치 위치>\ComfyUI`, 실행 파일 = `<설치 위치>\Start ComfyUI SageAttention.bat`

■ "설치 유형 = 데스크탑" 인 경우
  1. ComfyUI Desktop은 GUI 설치 프로그램이라 자동 설치가 안 됩니다. 사용자에게:
     "https://www.comfy.org/download 에서 ComfyUI Desktop을 받아 설치하고, 설치 중
      base 폴더를 `설치 위치`로 지정한 뒤 알려주세요. 첫 실행까지 마쳐주세요." 라고 요청하고 대기.
  2. 설치 후 ComfyUI 폴더를 찾습니다(다음 중 존재하는 것):
     - `<설치 위치>\ComfyUI`
     - `%LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Installs\*\ComfyUI`
     찾은 것을 <COMFY> 로 씁니다. (main.py 가 있어야 함)
  3. SageAttention + Triton 설치:
     - `<웹앱 위치>\..\_sage` 같은 임시 폴더에
       `git clone https://github.com/nicekriss/Sage-and-Triton-one-shot.git` 후
       `powershell -NoProfile -ExecutionPolicy Bypass -File .\SagePocketInstaller.ps1 -ComfyUIPath "<COMFY>"` 시도.
     - 이 도구가 대화형 UI만 뜨고 헤드리스가 안 되면, 아래를 직접 수행:
         a. <COMFY>의 Python으로 `import torch; print(torch.__version__)` 와 `python --version` 감지
            (예: 2.13.0+cu130 / 3.13)
         b. `<Python> -m pip install -U "triton-windows"`
         c. https://github.com/woct0rdho/SageAttention/releases 에서
            `sageattention-*+cu<XXX>torch<Y.Z>-cp<PP>-cp<PP>-win_amd64.whl` 중 감지한 조합과
            일치하는 wheel URL을 찾아 `<Python> -m pip install "<그 wheel URL>"`
         d. 일치하는 prebuilt wheel이 없으면: "이 torch/cuda/python 조합에 맞는 SageAttention
            prebuilt wheel이 아직 없습니다. 사용자가 nicekriss 도구를 직접 실행하거나 빌드해야
            합니다" 라고 보고하고 다음 단계로 진행(설치는 계속됨, sage만 미적용).
     - 검증: `<Python> -c "import triton, sageattention; print('sage ok')"`

════════════════ B. git / Node.js 확인 (없으면 설치) ════════════════

  - `git --version`  실패 → `winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements`
  - `node --version` 실패하거나 20.19 미만 →
    `winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements`
  - 설치 후에는 새 프로세스에서 PATH를 다시 읽어 재확인하세요.
  (포터블 EZi 배포판은 자체 git을 포함하지만, 웹앱 clone/npm 을 위해 시스템 git·node 도 확인)

════════════════ C. 커스텀 노드 팩 설치 ════════════════

  1. `<COMFY>\custom_nodes` 로 이동(없으면 생성).
  2. `git clone https://github.com/designloves2/ComfyUI-TJ_NODE_STUDIO_ONE.git`
     (이미 있으면 `git -C ComfyUI-TJ_NODE_STUDIO_ONE pull --ff-only`)
  3. `pyproject.toml`의 `version` 이 1.23.3 이상인지 확인. 낮으면 위 pull 재시도.
  4. 의존 팩 + Python 패키지 설치:
       cmd /c ""<COMFY>\custom_nodes\ComfyUI-TJ_NODE_STUDIO_ONE\install_requirements.bat" "<COMFY>"" < nul
     - 이 스크립트가 <COMFY>의 Python(.venv 또는 python_embeded)을 자동 탐지하고, 21개 의존
       노드 팩을 clone/업데이트하며 각 requirements.txt 를 설치합니다.
     - 예상되는 무시 가능 경고: `groundingdino-py` 빌드 실패(cp949), 일부 오디오 패키지.
       그 외의 `[WARN]`/`[ERROR]` 는 원문 그대로 최종 보고에 포함하세요.
     - `< nul` 은 스크립트 끝의 `pause` 때문입니다(빼면 멈춤).

════════════════ D. 웹앱(AI-ONE-STUDIO) 설치 ════════════════

  1. `git clone https://github.com/designloves2/AI-ONE-STUDIO.git "<웹앱 위치>"`
     (이미 있으면 `git -C "<웹앱 위치>" pull --ff-only`)
  2. `cd "<웹앱 위치>" && npm install`
  3. 웹 전용 추가 노드(상단 모니터 위젯)만 설치:
       cd "<COMFY>\custom_nodes"
       git clone https://github.com/crystian/ComfyUI-Crystools.git   (있으면 pull --ff-only)
       "<COMFY의 Python>" -m pip install -r ComfyUI-Crystools\requirements.txt
  4. `<웹앱 위치>\public\comfy_port.txt` 파일에 `ComfyUI 포트` 값(예: 8188) 한 줄을 씁니다.

════════════════ E. ComfyUI 실행 인자 설정 ════════════════

  웹앱이 ComfyUI와 통신하려면 `--enable-cors-header` 가 필수입니다. 권장 인자:
      --enable-cors-header --use-sage-attention --disable-smart-memory --bf16-unet
  (16GB 이하 VRAM 이면 `--reserve-vram 0.5` 또는 EZi 런처의 Dynamic VRAM 사용)

  - 포터블: `<설치 위치>\Start ComfyUI SageAttention.bat` 안의 `python ... main.py` 줄에 위 인자를
    추가(또는 EZi 런처 설정에서). CUDA Sysmem Fallback 은 끄지 마세요.
  - 데스크탑: 실행 파일 수정 불가 → 사용자에게 "Settings → Server-Config 의 추가 실행 인자에
    `--enable-cors-header --use-sage-attention` 를 넣고 앱을 재시작해주세요" 라고 안내만.

════════════════ F. 검증 ════════════════

  사용자에게 ComfyUI 재시작을 요청한 뒤:
  1. `http://127.0.0.1:<포트>/system_stats` → JSON 의 `argv` 에 `--enable-cors-header` 존재 확인.
  2. `http://127.0.0.1:<포트>/object_info` → `MiniMaxH3OneTJNode` 키 존재 확인(노드 로드 성공).
  3. `cd "<웹앱 위치>" && npm run dev` 실행 → `http://127.0.0.1:8774` 응답 확인 후 종료해도 됨.

════════════════ 금지 사항 ════════════════

  - 모델 파일(.safetensors, .pth, .gguf 등) 다운로드 금지.
  - 시스템 Python 에 pip 설치 금지 — 반드시 <COMFY> 의 Python 만.
  - 되돌리기 어려운 삭제·덮어쓰기 전 사용자 확인.

════════════════ 완료 보고 ════════════════

  - 설치 완료된 항목 / SageAttention 적용 여부
  - 무시 가능 범위였던 경고 목록 vs 그 외 실제 오류
  - 사용자가 직접 해야 할 것: (1) 모델 파일 다운로드
      · MiniMax H3: https://huggingface.co/Comfy-Org/MiniMax-H3
        - models/diffusion_models/ : minimax_h3_fl2va_* , minimax_h3_ref2va_*
        - models/text_encoders/    : qwen3vl_*_minimax_h3_*  (약 20GB)
        - models/vae/              : minimax_h3_video_vae_* , minimax_h3_audio_vae_*
        - models/loras/            : minimax_h3 turbo / PDD Acc LoRA (선택)
      · 다른 툴(Krea2/Z-Image/Klein/Qwen/SDXL) 모델은 노드 README 참고
    (2) 데스크탑이면 Settings 의 실행 인자, (3) 필요시 SageAttention 수동 마무리
  - 마지막에 노드 Settings → Models 탭에서 받은 모델을 한 번씩 지정하고 재시작하라고 안내.

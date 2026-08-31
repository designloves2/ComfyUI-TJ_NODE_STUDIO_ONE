@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

echo ========================================================
echo  TJ NODE ONE - Custom Nodes Installer / Updater
echo  (Z-Image / Klein / QE2511 / Krea2 / SDXL / Anima / MiniMax H3)
echo ========================================================
echo.
echo  Installs every node pack the ONE STUDIO nodes need, and updates
echo  the ones already present. Models are NOT downloaded - they are
echo  listed at the end and go in by hand.
echo.

:: custom_nodes 폴더 = 이 스크립트의 한 단계 위
set "CUSTOM_NODES=%~dp0.."
cd /d "%CUSTOM_NODES%"
echo [INFO] Custom nodes folder: %CUSTOM_NODES%
echo.

:: Python 경로 탐색 (ComfyUI 자체 환경 우선)
set "PYTHON="
if exist "%~dp0..\..\venv\Scripts\python.exe" (
    set "PYTHON=%~dp0..\..\venv\Scripts\python.exe"
) else if exist "%~dp0..\..\python_embeded\python.exe" (
    set "PYTHON=%~dp0..\..\python_embeded\python.exe"
) else if exist "%~dp0..\..\..\python_embeded\python.exe" (
    set "PYTHON=%~dp0..\..\..\python_embeded\python.exe"
) else (
    where python >nul 2>&1 && set "PYTHON=python"
)

if "%PYTHON%"=="" goto SKIP_PIP
echo [INFO] Python: %PYTHON%
rem 오래된 pip은 최신 wheel 태그/메타데이터를 몰라서 조용히 소스 빌드로 넘어가고,
rem 컴파일러가 없어 실패한다 - "내 PC에서만 안 된다"의 가장 흔한 원인이라 먼저 갱신한다.
echo [PIP] Updating pip / setuptools / wheel...
"%PYTHON%" -m pip install --upgrade pip --quiet
"%PYTHON%" -m pip install --upgrade setuptools wheel --quiet
rem wheel-stub(import 이름 wheel_stub)은 일반 "wheel" 패키지와 무관한, NVIDIA가 배포하는
rem 별도의 빌드 백엔드다. RTX 노드의 의존성이 이걸 build-backend로 선언하는데 pip이 선언된
rem 백엔드를 항상 자동으로 받아오지는 않아서 "Cannot import 'wheel_stub.buildapi'"가 난다.
rem 미리 깔아두는 것이 실제 해결책.
"%PYTHON%" -m pip install wheel-stub --quiet
echo [PIP] Done.
:SKIP_PIP

rem Some packs (insightface, onnx, older RTX deps) move numpy. ComfyUI and many nodes
rem still need numpy 1.x - record it now and restore it at the end if it changed.
set "NUMPY_BEFORE="
if not "%PYTHON%"=="" for /f "tokens=2" %%v in ('"%PYTHON%" -m pip show numpy 2^>nul ^| findstr /b /c:"Version:"') do set "NUMPY_BEFORE=%%v"
echo.

:: ── 설치할 노드 목록 ─────────────────────────────────────────────────────────
set REPOS[0]=https://github.com/ltdrdata/ComfyUI-Impact-Pack
set REPOS[1]=https://github.com/ltdrdata/ComfyUI-Impact-Subpack
set REPOS[2]=https://github.com/kijai/ComfyUI-KJNodes
set REPOS[3]=https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler
set REPOS[4]=https://github.com/cubiq/ComfyUI_FaceAnalysis
set REPOS[5]=https://github.com/1038lab/ComfyUI-RMBG
set REPOS[6]=https://github.com/Fannovel16/comfyui_controlnet_aux
set REPOS[7]=https://github.com/city96/ComfyUI-GGUF
set REPOS[8]=https://github.com/facok/comfyui-krea2-controlnet
:: Experimental - Krea2 IDENTITY / ControlNet(canny). May produce errors.
set REPOS[9]=https://github.com/lbouaraba/comfyui-krea2edit
set REPOS[10]=https://github.com/Nynxz/ComfyUI-NK2E
:: Experimental - MiniMax H3 ONE STUDIO (video). Optional accelerators/preview.
set REPOS[11]=https://github.com/lihaoyun6/ComfyUI-MiniMaxH3-Cache
set REPOS[12]=https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo
set REPOS[13]=https://github.com/kijai/ComfyUI-SolAttn_triton
set REPOS[14]=https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI
:: MiniMax H3 reference videos (VHS_LoadVideo) and the Spectrum accelerator
set REPOS[15]=https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite
set REPOS[16]=https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3
set REPOS[17]=https://github.com/duckyshell/ComfyUI-MiniMaxH3-FirstBlockCache
set REPOS[18]=https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes
set REPOS[19]=https://github.com/Saganaki22/ComfyUI-sol-attn
rem MiniMax-H3 PDD Acc: 8-step parallel-decoding LoRA (alibaba-pai weights).
set REPOS[20]=https://github.com/Jalen-Brunson/ComfyUI-MiniMax-H3-PDD-Acc
rem Sibling pack. Ships TJ_FreeTextEncoderVRAM, TJ_RTXDeblur, the H3 Audio Lock and
rem One-Take latent-continuation nodes, TJ_MultiImageLoader, and the LLM / vision utils.
set REPOS[21]=https://github.com/designloves2/ComfyUI-TJ_NODE

set COUNT=22
set /a LAST=COUNT-1

:: ComfyUI Manager는 저장소 이름이 아니라 pyproject의 name으로 폴더를 만든다. 그래서
:: Manager로 이미 설치된 팩을 저장소 이름으로 또 clone하면 같은 노드가 두 벌 등록되어
:: 팩이 깨진다. 이름이 다른 것들만 여기 적어두고 설치 전에 함께 확인한다.
set "ALT[3]=seedvr2_videoupscaler"
set "ALT[14]=comfyui_nvidia_rtx_nodes"
set "ALT[17]=minimax-h3-firstblockcache"

set /a N_NEW=0, N_UPD=0, N_CUR=0, N_FAIL=0

:: ── 설치 / 업데이트 루프 ────────────────────────────────────────────────────
:: 상한은 목록 개수에서 계산한다 - 예전에는 숫자가 박혀 있어서 목록에 항목을 추가해도
:: 뒤쪽 저장소가 그냥 설치되지 않고 넘어갔다.
for /L %%i in (0,1,!LAST!) do (
    set "URL=!REPOS[%%i]!"
    set "ALTNAME=!ALT[%%i]!"
    for %%F in (!URL!) do set "FOLDER=%%~nxF"

    set /a DISP=%%i+1
    echo --------------------------------------------------------
    echo [!DISP!/%COUNT%] !FOLDER!

    set "FOUND="
    if exist "!FOLDER!\" set "FOUND=!FOLDER!"
    if not defined FOUND if defined ALTNAME if exist "!ALTNAME!\" set "FOUND=!ALTNAME!"

    if defined FOUND (
        call :UPDATE_ONE "!FOUND!"
    ) else (
        call :INSTALL_ONE "!URL!" "!FOLDER!"
    )
    echo.
)

echo ========================================================
echo  Summary
echo ========================================================
echo   newly installed : !N_NEW!
echo   updated         : !N_UPD!
echo   already current : !N_CUR!
echo   failed          : !N_FAIL!
echo.

rem Restore numpy if a pack moved it.
if not "!NUMPY_BEFORE!"=="" if not "%PYTHON%"=="" (
    set "NUMPY_AFTER="
    for /f "tokens=2" %%v in ('"%PYTHON%" -m pip show numpy 2^>nul ^| findstr /b /c:"Version:"') do set "NUMPY_AFTER=%%v"
    if not "!NUMPY_AFTER!"=="!NUMPY_BEFORE!" (
        echo   [numpy] a dependency changed numpy !NUMPY_BEFORE! -^> !NUMPY_AFTER! - restoring !NUMPY_BEFORE!
        "%PYTHON%" -m pip install "numpy==!NUMPY_BEFORE!" --quiet || echo   [numpy] could not restore - run: "%PYTHON%" -m pip install numpy==!NUMPY_BEFORE!
    )
)
echo.
echo  Restart ComfyUI to load the changes.
echo ========================================================
echo.
echo  [Krea2 EXPERIMENTAL - IDENTITY / ControlNet depth^&canny]
echo  These are experimental and may produce errors.
echo  Place the LoRA files below into: models\loras\
echo    - IDENTITY : krea2_identity_edit_v1_2.safetensors
echo                 https://huggingface.co/conradlocke/krea2-identity-edit
echo    - Depth    : depth control LoRA
echo                 https://huggingface.co/Patil/Krea-2-depth-controlnet
echo    - Canny    : NK2E canny LoRA
echo                 https://huggingface.co/nynxz/NK2E
echo  Depth preprocessor (depth_anything_v2_vitl.pth) auto-downloads on first use
echo  into: comfyui_controlnet_aux\ckpts\depth-anything\  (vitg/Giant NOT supported)
echo  Register the LoRA FILES in Settings; adjust values in the side-menu panel.
echo ========================================================
echo.
echo  [MiniMax H3 ONE STUDIO - EXPERIMENTAL video node]
echo  Models ^(https://huggingface.co/Comfy-Org/MiniMax-H3^):
echo    models\diffusion_models\ : minimax_h3_fl2va_*  ^(text / first-last^)
echo                               minimax_h3_ref2va_* ^(reference mode^)
echo    models\text_encoders\    : qwen3vl_*_minimax_h3_*   ^(CLIPLoader type=minimax^)
echo    models\vae\              : minimax_h3_video_vae_*  +  minimax_h3_audio_vae_*
echo    models\loras\            : minimax_h3 turbo LoRA ^(optional, for Turbo^)
echo  Select them once in the node's Settings ^> Models tab.
echo ========================================================
pause
exit /b 0


:: ── 신규 설치 ───────────────────────────────────────────────────────────────
:INSTALL_ONE
set "U=%~1"
set "F=%~2"
echo [INSTALL] Cloning %U%
git clone --depth 1 "%U%" "%F%"
if errorlevel 1 (
    echo [ERROR] git clone failed. Check your internet connection, then re-run.
    set /a N_FAIL+=1
    exit /b 0
)
echo [OK] Cloned.
set /a N_NEW+=1
call :INSTALL_REQS "%F%"
exit /b 0


:: ── 기존 설치 업데이트 ──────────────────────────────────────────────────────
:UPDATE_ONE
set "F=%~1"
if not exist "%F%\.git\" (
    echo [SKIP] Present as "%F%" but not a git checkout - left untouched.
    set /a N_CUR+=1
    call :INSTALL_REQS "%F%"
    exit /b 0
)
echo [UPDATE] %F%
set "BEFORE=?"
set "AFTER=?"
for /f "delims=" %%H in ('git -C "%F%" rev-parse --short HEAD 2^>nul') do set "BEFORE=%%H"
git -C "%F%" pull --ff-only
if errorlevel 1 (
    echo [WARN] Could not fast-forward ^(local edits, or a pinned version^). Left untouched.
    set /a N_CUR+=1
    call :INSTALL_REQS "%F%"
    exit /b 0
)
for /f "delims=" %%H in ('git -C "%F%" rev-parse --short HEAD 2^>nul') do set "AFTER=%%H"
if "!BEFORE!"=="!AFTER!" (
    echo [OK] Already up to date ^(!AFTER!^).
    set /a N_CUR+=1
) else (
    echo [OK] Updated !BEFORE! -^> !AFTER!
    set /a N_UPD+=1
)
call :INSTALL_REQS "%F%"
exit /b 0


:: ── 의존성 설치 ─────────────────────────────────────────────────────────────
:INSTALL_REQS
set "F=%~1"
if "%PYTHON%"=="" exit /b 0
if not exist "%F%\requirements.txt" exit /b 0

echo [PIP] Checking requirements...
set "REQ_FILE=%F%\requirements.txt"
set "REQ_FILTERED=%TEMP%\tj_req_%RANDOM%.txt"

rem dlib은 소스 빌드에 cmake/C++ 컴파일러가 필요해 실패하는 주 원인이므로 걸러내고
rem 아래에서 사전 컴파일된 wheel(dlib-bin)로 대체 설치한다.
findstr /v /i /r "^dlib" "%REQ_FILE%" > "%REQ_FILTERED%"

for %%A in ("%REQ_FILTERED%") do set "REQSIZE=%%~zA"
if not "%REQSIZE%"=="0" (
    "%PYTHON%" -m pip install -r "%REQ_FILTERED%" --quiet
    if errorlevel 1 (
        rem pip은 패키지마다 격리된 빌드 환경을 만드는데, 그 환경은 위에서 전역으로 깐
        rem 빌드 도구를 물려받지 않는다. 그래서 wheel_stub이 전역에 있어도 격리 환경
        rem 안에서는 없다며 실패한다. 격리를 끄면 전역 도구를 쓰게 되고, 이것이 RTX
        rem 노드가 설치되게 만드는 부분이다.
        echo [PIP] Retrying with --no-build-isolation...
        "%PYTHON%" -m pip install -r "%REQ_FILTERED%" --no-build-isolation --quiet
        if errorlevel 1 (
            echo [WARN] Some requirements failed - this pack may not load.
        ) else (
            echo [PIP] Done ^(retried with --no-build-isolation^).
        )
    ) else (
        echo [PIP] Done.
    )
)

findstr /i /r "^dlib" "%REQ_FILE%" >nul
if not errorlevel 1 (
    echo [PIP] Installing dlib ^(prebuilt wheel, no cmake needed^)...
    "%PYTHON%" -m pip install dlib-bin --quiet
    if errorlevel 1 (
        echo [WARN] dlib skipped - face-analysis features needing it will not work.
        echo        ^(Optional: install CMake + Visual Studio Build Tools, then run:
        echo         "%PYTHON%" -m pip install dlib^)
    ) else (
        echo [PIP] dlib installed.
    )
)

del "%REQ_FILTERED%" >nul 2>&1
exit /b 0

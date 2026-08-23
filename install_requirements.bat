@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

echo ========================================================
echo  TJ NODE ONE - Required Custom Nodes Installer
echo  (Z-Image / Klein / QE2511 / Krea2 ONE STUDIO)
echo ========================================================
echo.

:: custom_nodes 폴더 = 이 스크립트의 한 단계 위
set "CUSTOM_NODES=%~dp0.."
cd /d "%CUSTOM_NODES%"
echo [INFO] Custom nodes folder: %CUSTOM_NODES%
echo.

:: Python 경로 탐색 (ComfyUI venv 우선)
set "PYTHON="
if exist "%~dp0..\..\venv\Scripts\python.exe" (
    set "PYTHON=%~dp0..\..\venv\Scripts\python.exe"
) else if exist "%~dp0..\..\python_embeded\python.exe" (
    set "PYTHON=%~dp0..\..\python_embeded\python.exe"
) else (
    where python >nul 2>&1 && set "PYTHON=python"
)

if "%PYTHON%"=="" (
    echo [WARN] Python not found. pip install steps will be skipped.
    echo        Run this script from inside the ComfyUI Python environment.
) else (
    echo [INFO] Python: %PYTHON%
)
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
:: 🧪 Experimental — Krea2 IDENTITY / ControlNet(canny). May produce errors.
set REPOS[9]=https://github.com/lbouaraba/comfyui-krea2edit
set REPOS[10]=https://github.com/Nynxz/ComfyUI-NK2E
:: 🧪 Experimental — MiniMax H3 ONE STUDIO (video). Optional accelerators/preview.
set REPOS[11]=https://github.com/lihaoyun6/ComfyUI-MiniMaxH3-Cache
set REPOS[12]=https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo
set REPOS[13]=https://github.com/kijai/ComfyUI-SolAttn_triton
set REPOS[14]=https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI
:: MiniMax H3 reference videos (VHS_LoadVideo) and the Spectrum accelerator
set REPOS[15]=https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite
set REPOS[16]=https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3
set REPOS[17]=https://github.com/duckyshell/ComfyUI-MiniMaxH3-FirstBlockCache
set REPOS[18]=https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes

set COUNT=19

:: ── 설치 루프 ──────────────────────────────────────────────────────────────────
for /L %%i in (0,1,16) do (
    set "URL=!REPOS[%%i]!"

    :: URL에서 폴더명 추출 (마지막 /뒤)
    for %%F in (!URL!) do set "FOLDER=%%~nxF"

    echo --------------------------------------------------------
    echo [%%i/8] !FOLDER!
    echo         !URL!

    if exist "!FOLDER!" (
        echo [SKIP] Already installed.
    ) else (
        echo [INSTALL] Cloning...
        git clone "!URL!" "!FOLDER!"
        if errorlevel 1 (
            echo [ERROR] git clone failed. Check your internet connection.
        ) else (
            echo [OK] Cloned successfully.
            :: requirements.txt 가 있으면 pip install
            if not "%PYTHON%"=="" (
                if exist "!FOLDER!\requirements.txt" (
                    echo [PIP] Installing requirements...

                    rem dlib은 소스 빌드에 cmake/C++ 컴파일러가 필요해 초보 사용자 환경에서 실패하는
                    rem 주 원인이므로, requirements에서 걸러내고 사전 컴파일된 wheel(dlib-bin)로 대체 설치한다.
                    set "REQ_FILE=!FOLDER!\requirements.txt"
                    set "REQ_FILTERED=%TEMP%\tj_req_!FOLDER!.txt"
                    findstr /v /i "^dlib" "!REQ_FILE!" > "!REQ_FILTERED!"

                    "%PYTHON%" -m pip install -r "!REQ_FILTERED!" --quiet
                    if errorlevel 1 (
                        echo [WARN] pip install had errors. Check manually.
                    ) else (
                        echo [PIP] Done.
                    )

                    findstr /i /r "^dlib" "!REQ_FILE!" >nul
                    if not errorlevel 1 (
                        echo [PIP] Installing dlib ^(prebuilt wheel, no cmake needed^)...
                        "%PYTHON%" -m pip install dlib-bin --quiet
                        if errorlevel 1 (
                            echo [WARN] dlib install skipped. Face-analysis features needing dlib may not work.
                            echo        ^(Optional: install CMake + Visual Studio Build Tools, then run:
                            echo         "%PYTHON%" -m pip install dlib^)
                        ) else (
                            echo [PIP] dlib installed successfully.
                        )
                    )

                    del "!REQ_FILTERED!" >nul 2>&1
                )
            )
        )
    )
    echo.
)

echo ========================================================
echo  Done! Restart ComfyUI to load the new nodes.
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
echo    models\loras\            : minimax_h3 turbo LoRA ^(optional, for Accel=Turbo^)
echo  Select them once in the node's Settings ^> Models tab.
echo ========================================================
pause

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
set REPOS[3]=https://github.com/kijai/ComfyUI-SeedVR2
set REPOS[4]=https://github.com/cubiq/ComfyUI_FaceAnalysis
set REPOS[5]=https://github.com/1038lab/ComfyUI-RMBG
set REPOS[6]=https://github.com/Fannovel16/comfyui_controlnet_aux
set REPOS[7]=https://github.com/city96/ComfyUI-GGUF

set COUNT=8

:: ── 설치 루프 ──────────────────────────────────────────────────────────────────
for /L %%i in (0,1,7) do (
    set "URL=!REPOS[%%i]!"

    :: URL에서 폴더명 추출 (마지막 /뒤)
    for %%F in (!URL!) do set "FOLDER=%%~nxF"

    echo --------------------------------------------------------
    echo [%%i/7] !FOLDER!
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
                    "%PYTHON%" -m pip install -r "!FOLDER!\requirements.txt" --quiet
                    if errorlevel 1 (
                        echo [WARN] pip install had errors. Check manually.
                    ) else (
                        echo [PIP] Done.
                    )
                )
            )
        )
    )
    echo.
)

echo ========================================================
echo  Done! Restart ComfyUI to load the new nodes.
echo ========================================================
pause

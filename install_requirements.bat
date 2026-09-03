@echo off
setlocal EnableDelayedExpansion

echo ========================================================
echo  TJ NODE ONE - Custom Nodes Installer / Updater
echo  (Z-Image / Klein / QE2511 / Krea2 / SDXL / Anima / MiniMax H3)
echo ========================================================
echo.
echo  Installs every node pack the ONE STUDIO nodes need, and updates
echo  the ones already present. Models are NOT downloaded - they are
echo  listed at the end and go in by hand.
echo.

:: ComfyUI folder. First argument wins ("install_requirements.bat C:\path\to\ComfyUI");
:: otherwise it is derived from where this script sits (custom_nodes\<this pack>\ -> up 2).
:: Passing the path lets you run this from anywhere and covers unusual install layouts.
if not "%~1"=="" (
    for %%D in ("%~1") do set "COMFY_DIR=%%~fD"
) else (
    for %%D in ("%~dp0..\..") do set "COMFY_DIR=%%~fD"
)
if not exist "!COMFY_DIR!\" (
    echo [FATAL] ComfyUI folder not found: !COMFY_DIR!
    echo         Pass it as the first argument, e.g.  install_requirements.bat "C:\ComfyUI"
    pause
    exit /b 1
)
if not exist "!COMFY_DIR!\main.py" (
    echo [FATAL] "!COMFY_DIR!" does not look like a ComfyUI folder ^(no main.py^).
    echo         Pass the ComfyUI folder itself, e.g.  install_requirements.bat "C:\ComfyUI"
    pause
    exit /b 1
)
:: BASE_DIR = the folder above ComfyUI (portable root / Desktop base dir).
for %%D in ("!COMFY_DIR!\..") do set "BASE_DIR=%%~fD"

set "CUSTOM_NODES=!COMFY_DIR!\custom_nodes"
if not exist "!CUSTOM_NODES!\" md "!CUSTOM_NODES!"
cd /d "!CUSTOM_NODES!"
echo [INFO] ComfyUI folder     : !COMFY_DIR!
echo [INFO] Custom nodes folder : !CUSTOM_NODES!
echo.

:: Python discovery. A real venv wins over any base interpreter: ComfyUI Desktop runs
:: from <ComfyUI>\.venv (a uv venv whose home points at ..\standalone-env), and that is
:: where its packages must land - installing straight into standalone-env would leave
:: ComfyUI unable to see them, same as using the system Python.
::   <ComfyUI>\venv | .venv \Scripts\python.exe   - manual venv / ComfyUI Desktop
::   <base>\venv | .venv \Scripts\python.exe       - venv beside ComfyUI
::   <base>\standalone-env\python.exe              - Desktop base interpreter (only if no .venv)
::   <ComfyUI>\python_embeded\python.exe           - embedded python inside ComfyUI
::   <base>\python_embeded\python.exe              - portable build (python_embeded beside ComfyUI)
:: Only if none of those exist do we touch "where python" (system Python) - and warn.
set "PYTHON="
for %%P in (
    "!COMFY_DIR!\venv\Scripts\python.exe"
    "!COMFY_DIR!\.venv\Scripts\python.exe"
    "!BASE_DIR!\venv\Scripts\python.exe"
    "!BASE_DIR!\.venv\Scripts\python.exe"
    "!BASE_DIR!\standalone-env\python.exe"
    "!COMFY_DIR!\python_embeded\python.exe"
    "!BASE_DIR!\python_embeded\python.exe"
) do if not defined PYTHON if exist "%%~P" set "PYTHON=%%~P"

if not defined PYTHON (
    where python >nul 2>&1 && set "PYTHON=python"
    if defined PYTHON (
        echo.
        echo [WARNING] No ComfyUI Python environment found for:
        echo             !COMFY_DIR!
        echo           Falling back to the system Python on PATH - dependencies would be
        echo           installed there, NOT into ComfyUI, and ComfyUI will not see them.
        echo           Pass the ComfyUI folder as the first argument, e.g.
        echo             install_requirements.bat "D:\ComfyUI-Desktop\ComfyUI"
        echo           (ComfyUI Desktop: inside the base folder you chose at install,
        echo            the one that also holds "standalone-env\")
        echo.
        choice /c YN /m "Continue with the system Python anyway"
        if errorlevel 2 (
            set "PYTHON="
            echo [INFO] Skipping all dependency installs - no ComfyUI Python to use.
            goto SKIP_PIP
        )
    )
)

if not defined PYTHON goto SKIP_PIP
echo [INFO] Python: !PYTHON!
rem An outdated pip is the most common cause of "it only fails on my machine": it
rem predates current wheel tags/metadata, quietly falls back to a source build, and
rem then dies for want of a compiler. Update it first.
echo [PIP] Updating pip / setuptools / wheel...
"%PYTHON%" -m pip install --upgrade pip --quiet
"%PYTHON%" -m pip install --upgrade setuptools wheel --quiet
rem wheel-stub (imported as wheel_stub) is a separate NVIDIA-published build backend,
rem unrelated to the ordinary "wheel" package. The RTX nodes' dependency declares it as
rem its build-backend, and pip does not always fetch a declared backend on its own,
rem which is what produces "Cannot import 'wheel_stub.buildapi'". Installing it up front
rem is the actual fix.
"%PYTHON%" -m pip install wheel-stub --quiet
echo [PIP] Done.
:SKIP_PIP

rem Some packs (insightface, onnx, older RTX deps) move numpy. ComfyUI and many nodes
rem still need numpy 1.x - record it now and restore it at the end if it changed.
set "NUMPY_BEFORE="
if not "%PYTHON%"=="" for /f "tokens=2" %%v in ('"%PYTHON%" -m pip show numpy 2^>nul ^| findstr /b /c:"Version:"') do set "NUMPY_BEFORE=%%v"
echo.

:: -- node repositories ------------------------------------------------------
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

:: ComfyUI Manager names a folder after the pack's pyproject "name", not the repo name.
:: Cloning under the repo name next to a Manager install would register the same nodes
:: twice and break the pack. Only the packs whose two names differ are listed here, and
:: checked alongside the repo name before installing.
set "ALT[3]=seedvr2_videoupscaler"
set "ALT[14]=comfyui_nvidia_rtx_nodes"
set "ALT[17]=minimax-h3-firstblockcache"

set /a N_NEW=0, N_UPD=0, N_CUR=0, N_FAIL=0

:: -- install / update loop --------------------------------------------------
:: The upper bound is computed from the list length - it used to be a literal number,
:: so adding an entry left the last repos silently uninstalled.
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


:: -- fresh install ----------------------------------------------------------
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


:: -- update an existing install ---------------------------------------------
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


:: -- requirements for one pack ----------------------------------------------
:INSTALL_REQS
set "F=%~1"
if "%PYTHON%"=="" exit /b 0
if not exist "%F%\requirements.txt" exit /b 0

echo [PIP] Checking requirements...
set "REQ_FILE=%F%\requirements.txt"
set "REQ_FILTERED=%TEMP%\tj_req_%RANDOM%.txt"

rem dlib builds from source and needs cmake plus a C++ toolchain - the usual reason
rem this script "fails" for people. Filter it out and install the prebuilt wheel
rem (dlib-bin) below instead.
findstr /v /i /r "^dlib" "%REQ_FILE%" > "%REQ_FILTERED%"

for %%A in ("%REQ_FILTERED%") do set "REQSIZE=%%~zA"
if not "%REQSIZE%"=="0" (
    "%PYTHON%" -m pip install -r "%REQ_FILTERED%" --quiet
    if errorlevel 1 (
        rem pip builds each package in an isolated environment that does NOT inherit the
        rem build tools installed above, so a package needing wheel_stub fails there even
        rem though it is present globally. Dropping the isolation lets it use them - this
        rem is what makes the RTX nodes install.
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

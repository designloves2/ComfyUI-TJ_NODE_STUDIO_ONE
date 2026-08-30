@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem chcp 65001 >nul

echo ========================================================
echo  Update every custom node (git pull)
echo ========================================================
echo.
echo  Pulls every git checkout under custom_nodes.
echo  Uses --ff-only, so a folder with local edits or a pinned
echo  version is reported and left exactly as it is - nothing
echo  is ever merged, reset or discarded.
echo.

set "CUSTOM_NODES=%~dp0.."
cd /d "%CUSTOM_NODES%"
echo [INFO] Folder: %CD%

rem Only used to refresh requirements for packs that actually moved.
set "PYTHON_EXE="
if exist "%~dp0..\..\venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0..\..\venv\Scripts\python.exe"
) else if exist "%~dp0..\..\python_embeded\python.exe" (
    set "PYTHON_EXE=%~dp0..\..\python_embeded\python.exe"
) else if exist "%~dp0..\..\..\python_embeded\python.exe" (
    set "PYTHON_EXE=%~dp0..\..\..\python_embeded\python.exe"
)
if "%PYTHON_EXE%"=="" (
    echo [INFO] Python not found - requirements will not be refreshed.
) else (
    echo [INFO] Python: %PYTHON_EXE%
)
echo.

set /a N_UPD=0, N_CUR=0, N_SKIP=0, N_LOCK=0, N_FAIL=0
set "UPDATED="
set "BLOCKED="

for /d %%D in (*) do call :ONE "%%~nxD"

echo.
echo ========================================================
echo  Summary
echo ========================================================
echo   updated        : !N_UPD!
echo   already current: !N_CUR!
echo   local changes  : !N_LOCK!   (left untouched)
echo   not a git repo : !N_SKIP!
echo   failed         : !N_FAIL!
if defined UPDATED (
    echo.
    echo   Updated:!UPDATED!
)
if defined BLOCKED (
    echo.
    echo   Left alone because of local changes:!BLOCKED!
    echo   ^(commit or stash inside those folders, then re-run^)
)
echo.
echo  Restart ComfyUI to load the updated nodes.
echo ========================================================
pause
exit /b 0


:ONE
set "D=%~1"
if not exist "%D%\.git\" (
    set /a N_SKIP+=1
    exit /b 0
)

echo --------------------------------------------------------
echo [%D%]

rem A dirty tree makes even --ff-only fail partway on some setups, so check first and
rem say plainly that nothing was touched - much clearer than a git error wall.
set "DIRTY="
for /f "delims=" %%S in ('git -C "%D%" status --porcelain 2^>nul') do set "DIRTY=1"
if defined DIRTY (
    echo   [SKIP] local changes present - not touched.
    set /a N_LOCK+=1
    set "BLOCKED=!BLOCKED! %D%"
    exit /b 0
)

set "BEFORE=?"
set "AFTER=?"
for /f "delims=" %%H in ('git -C "%D%" rev-parse --short HEAD 2^>nul') do set "BEFORE=%%H"

git -C "%D%" pull --ff-only
if errorlevel 1 (
    echo   [WARN] could not fast-forward ^(detached HEAD, pinned tag, or no upstream^).
    set /a N_FAIL+=1
    exit /b 0
)

for /f "delims=" %%H in ('git -C "%D%" rev-parse --short HEAD 2^>nul') do set "AFTER=%%H"
if "!BEFORE!"=="!AFTER!" (
    echo   [OK] already up to date ^(!AFTER!^)
    set /a N_CUR+=1
) else (
    echo   [OK] !BEFORE! -^> !AFTER!
    set /a N_UPD+=1
    set "UPDATED=!UPDATED! %D%"

    rem A new version can add or bump dependencies, so refresh them for anything that
    rem actually moved. Unchanged packs are left alone ? re-running pip across every
    rem folder would take far longer than the pulls themselves.
    call :REQS "%D%"
)
exit /b 0


:REQS
set "R=%~1"
if "%PYTHON_EXE%"=="" exit /b 0
if not exist "%R%\requirements.txt" exit /b 0

echo   [PIP] refreshing requirements...
set "RF=%TEMP%\tj_upd_%RANDOM%.txt"
rem dlib builds from source and needs cmake plus a C++ toolchain; the prebuilt wheel
rem installed below is what actually works on a normal machine.
findstr /v /i /r "^dlib" "%R%\requirements.txt" > "%RF%"

for %%A in ("%RF%") do set "RSZ=%%~zA"
if not "%RSZ%"=="0" (
    "%PYTHON_EXE%" -m pip install -r "%RF%" --quiet
    if errorlevel 1 (
        rem pip's isolated build environment does not inherit globally installed build
        rem backends ? wheel_stub, which the RTX nodes need ? so retry without it.
        "%PYTHON_EXE%" -m pip install -r "%RF%" --no-build-isolation --quiet
        if errorlevel 1 (
            echo   [WARN] some requirements failed - this pack may not load.
        ) else (
            echo   [PIP] done ^(--no-build-isolation^).
        )
    ) else (
        echo   [PIP] done.
    )
)

findstr /i /r "^dlib" "%R%\requirements.txt" >nul
if not errorlevel 1 (
    "%PYTHON_EXE%" -m pip install dlib-bin --quiet
    if errorlevel 1 echo   [WARN] dlib skipped.
)

del "%RF%" >nul 2>&1
exit /b 0

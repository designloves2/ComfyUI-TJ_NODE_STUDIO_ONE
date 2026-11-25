@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ========================================================
echo  TJ NODE - one click updater
echo ========================================================
echo.
echo  Downloads the latest version of the TJ nodes with git pull.
echo  Your settings and favorites are kept.
echo.

rem This file sits in the node folder (custom_nodes\ComfyUI-TJ_NODE_STUDIO_ONE). The core pack
rem ComfyUI-TJ_NODE next to it is updated the same way.
set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
set "CUSTOM_NODES=%HERE%\.."

where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed, so this updater cannot run.
    echo         Install it from https://git-scm.com/download/win and run this file again.
    goto :END
)

set /a N_OK=0, N_NEW=0, N_FAIL=0

call :UPDATE "%HERE%"
if exist "%CUSTOM_NODES%\ComfyUI-TJ_NODE\.git" call :UPDATE "%CUSTOM_NODES%\ComfyUI-TJ_NODE"

echo.
echo ========================================================
if !N_FAIL! GTR 0 (
    echo  Some updates did not finish - see the messages above.
) else if !N_NEW! GTR 0 (
    echo  Update finished. Restart ComfyUI to use the new version.
) else (
    echo  Everything is already up to date.
)
echo ========================================================
echo.
if !N_NEW! GTR 0 if exist "%HERE%\install_requirements.bat" if /i not "%~1"=="/nopause" (
    echo  If this update added libraries or node packs, install them now.
    echo  It runs install_requirements.bat and takes several minutes.
    set "DEPS="
    set /p "DEPS=Install them now? Y or N, default N: "
    if /i "!DEPS!"=="Y" call "%HERE%\install_requirements.bat"
) else (
    echo  If a new version needs new libraries, also run install_requirements.bat once.
)

:END
echo.
if /i not "%~1"=="/nopause" pause
exit /b 0


rem ---------------------------------------------------------------------------
rem  :UPDATE <folder>  - git pull one node folder
rem ---------------------------------------------------------------------------
:UPDATE
set "D=%~1"
for %%F in ("%D%") do set "NAME=%%~nxF"
echo --------------------------------------------------------
echo [!NAME!]

if not exist "%D%\.git\" (
    echo   [SKIP] This is not a git folder - was it installed from a zip? Download the latest zip instead.
    set /a N_FAIL+=1
    exit /b 0
)

set "BEFORE=?"
set "AFTER=?"
for /f "delims=" %%H in ('git -C "%D%" rev-parse --short HEAD 2^>nul') do set "BEFORE=%%H"

git -C "%D%" pull --ff-only
if not errorlevel 1 goto :PULLED

echo.
echo   The normal update was blocked, probably by files changed on this PC.
echo   Trying again with a safe backup of your settings...
call :SAFE_RETRY "%D%"
if errorlevel 1 (
    echo   [ERROR] Could not update !NAME!. Nothing was lost. Check your internet connection and run this file again.
    set /a N_FAIL+=1
    exit /b 0
)

:PULLED
for /f "delims=" %%H in ('git -C "%D%" rev-parse --short HEAD 2^>nul') do set "AFTER=%%H"
if "!BEFORE!"=="!AFTER!" (
    echo   [OK] Already up to date - !AFTER!
    set /a N_OK+=1
) else (
    echo   [OK] Updated !BEFORE! to !AFTER!
    echo   Latest changes:
    git -C "%D%" log --oneline !BEFORE!..!AFTER! -n 10
    set /a N_NEW+=1
)
exit /b 0


rem ---------------------------------------------------------------------------
rem  :SAFE_RETRY <folder>
rem  Copies the user data files (settings, favorites, templates) away, puts every other local
rem  change aside with "git stash", pulls, then copies the user data files back. Returns 1 on failure.
rem ---------------------------------------------------------------------------
:SAFE_RETRY
set "R=%~1"
set "BK=%R%\..\_node_update_backup\!NAME!_%RANDOM%%RANDOM%"
md "%BK%" >nul 2>&1

for %%P in ("%R%\config_*.json" "%R%\favorites_*.json" "%R%\templates_prompt_*.json" "%R%\studio_llm*.json" "%R%\sensitive_media.json") do (
    if exist "%%~fP" copy /y "%%~fP" "%BK%\" >nul 2>&1
)
echo   [BACKUP] Your settings were copied to: %BK%

git -C "%R%" stash
git -C "%R%" pull --ff-only
if errorlevel 1 (
    echo   [WARN] Still blocked - putting your files back as they were.
    git -C "%R%" stash pop >nul 2>&1
    exit /b 1
)

rem Put the user data back exactly as it was (the update must not replace what you set up).
for %%P in ("%BK%\*") do copy /y "%%~fP" "%R%\" >nul 2>&1
echo   [OK] Your settings and favorites were restored.
echo   Other local edits, if any, are kept safely in git stash of this folder.
exit /b 0

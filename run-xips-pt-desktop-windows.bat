@echo off
setlocal EnableExtensions

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

pushd "%REPO_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo Failed to switch to the repository directory:
  echo   %REPO_ROOT%
  exit /b 1
)

call :require_command git "Git"
if errorlevel 1 exit /b 1
call :require_command npm "npm"
if errorlevel 1 exit /b 1
call :require_command npx "npx"
if errorlevel 1 exit /b 1
call :require_command cargo "Cargo"
if errorlevel 1 exit /b 1
call :require_command rustc "Rust"
if errorlevel 1 exit /b 1

echo.
echo == Pulling the latest code ==
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Git pull failed. If you have local changes, commit or stash them first.
  goto :fail
)

echo.
echo == Installing workspace dependencies ==
call npm install
if errorlevel 1 goto :fail

echo.
echo == Building the Windows desktop app ==
pushd "apps\desktop" >nul 2>&1
if errorlevel 1 (
  echo Could not find apps\desktop from:
  echo   %REPO_ROOT%
  goto :fail
)

call npx tauri build
if errorlevel 1 (
  popd >nul
  goto :fail
)
popd >nul

call :find_app_exe
if not defined APP_EXE (
  echo.
  echo Build finished, but the desktop executable was not found under:
  echo   %REPO_ROOT%\apps\desktop\src-tauri\target\release
  goto :fail
)

echo.
echo == Launching xips-pt desktop ==
echo %APP_EXE%
start "" "%APP_EXE%"
if errorlevel 1 goto :fail

echo.
echo xips-pt desktop started successfully.
popd >nul
exit /b 0

:require_command
where %~1 >nul 2>&1
if errorlevel 1 (
  echo Missing required tool: %~2
  echo Install it, open a new terminal, and run this script again.
  popd >nul
  exit /b 1
)
exit /b 0

:find_app_exe
set "APP_EXE="

for %%F in (
  "%REPO_ROOT%\apps\desktop\src-tauri\target\release\xips-pt desktop.exe"
  "%REPO_ROOT%\apps\desktop\src-tauri\target\release\xips-pt-desktop.exe"
) do (
  if exist "%%~fF" (
    set "APP_EXE=%%~fF"
    exit /b 0
  )
)

for /f "delims=" %%F in ('dir /b /s "%REPO_ROOT%\apps\desktop\src-tauri\target\release\*.exe" 2^>nul ^| findstr /i /v "\\bundle\\"') do (
  set "APP_EXE=%%F"
  exit /b 0
)

exit /b 1

:fail
echo.
echo The update/build/launch flow did not complete.
echo Prerequisites: Git, Node.js with npm/npx, and Rust with the Windows MSVC toolchain.
popd >nul
exit /b 1

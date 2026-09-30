@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo       Ghost Interview Copilot - Auto-Update Utility       
echo ============================================================
echo.

cd /d "%~dp0\.."

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js / npm is not installed or not in PATH.
    pause
    exit /b 1
)

echo [*] Fetching latest updates from GitHub...
git fetch origin main

for /f %%i in ('git rev-parse HEAD') do set CURRENT_HASH=%%i
for /f %%i in ('git rev-parse origin/main') do set REMOTE_HASH=%%i

if "%CURRENT_HASH%"=="%REMOTE_HASH%" (
    echo [OK] Ghost Copilot is already at the latest version.
) else (
    echo [*] New updates found! Pulling latest changes...
    git pull --rebase origin main
    if %errorlevel% neq 0 (
        echo [ERROR] Git pull failed. Please resolve conflicts manually.
        pause
        exit /b 1
    )

    echo [*] Updating dependencies...
    call npm install --prefer-offline --no-audit

    if exist mobile (
        echo [*] Checking mobile dependencies...
        cd mobile
        call npm install --prefer-offline --no-audit
        cd ..
    )

    echo [*] Running verification test suite...
    call npm test

    echo.
    echo [SUCCESS] Ghost Copilot successfully updated to latest version!
    echo Run "npm start" to launch Ghost.
)

pause

@echo off
echo ========================================
echo  FocusApp - Building Windows Installer
echo ========================================
echo.

REM Vérifier que Node.js est installé
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not found. Install from https://nodejs.org/
    pause
    exit /b 1
)

REM Vérifier que Rust est installé
where cargo >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Rust not found. Install from https://rustup.rs/
    pause
    exit /b 1
)

echo [1/6] Cleaning previous builds...
if exist "src-tauri\target\release\bundle" (
    rmdir /S /Q "src-tauri\target\release\bundle"
)

echo [2/6] Installing frontend dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo [3/6] Building frontend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Frontend build failed
    pause
    exit /b 1
)

echo [4/6] Building Tauri application...
call npm run tauri build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Tauri build failed
    pause
    exit /b 1
)

echo [5/6] Locating installer...
set "BUNDLE_DIR=src-tauri\target\release\bundle\nsis"
if not exist "%BUNDLE_DIR%" (
    echo ERROR: Bundle directory not found
    pause
    exit /b 1
)

echo [6/6] Build successful!
echo.
echo ========================================
echo  Installer created:
echo  %BUNDLE_DIR%\FocusApp_1.0.0_x64-setup.exe
echo ========================================
echo.

REM Ouvrir le dossier contenant l'installateur
explorer "%BUNDLE_DIR%"

pause

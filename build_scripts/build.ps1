Write-Host "================================" -ForegroundColor Cyan
Write-Host "FOCUS - Build Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Change to project root
Set-Location $PSScriptRoot\..

# Check if virtual environment exists
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller

# Clean previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "build") { Remove-Item -Recurse -Force build }
if (Test-Path "dist") { Remove-Item -Recurse -Force dist }

# Build with PyInstaller
Write-Host ""
Write-Host "Building executable..." -ForegroundColor Yellow
Write-Host ""
python -m PyInstaller build_scripts\build.spec --clean

# Check if build succeeded
if (Test-Path "dist\FOCUS\FOCUS.exe") {
    Write-Host ""
    Write-Host "================================" -ForegroundColor Green
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Executable location: dist\FOCUS\FOCUS.exe" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Test the executable: dist\FOCUS\FOCUS.exe"
    Write-Host "2. Create installer with Inno Setup (see installer.iss)"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "================================" -ForegroundColor Red
    Write-Host "BUILD FAILED!" -ForegroundColor Red
    Write-Host "================================" -ForegroundColor Red
    Write-Host "Check errors above." -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Read-Host "Press Enter to continue"

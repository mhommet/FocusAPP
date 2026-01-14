Write-Host "================================" -ForegroundColor Cyan
Write-Host "FOCUS - Full Build Pipeline" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Change to project root
Set-Location $PSScriptRoot\..

# Step 1: Build executable
Write-Host "[1/3] Building executable with PyInstaller..." -ForegroundColor Yellow
Write-Host ""
& .\build_scripts\build.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build failed! Aborting." -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

# Step 2: Quick test
Write-Host ""
Write-Host "[2/3] Quick test of executable..." -ForegroundColor Yellow
Write-Host "Starting FOCUS.exe for 5 seconds..."
Start-Process "dist\FOCUS\FOCUS.exe" -PassThru | Out-Null
Start-Sleep -Seconds 5
Stop-Process -Name "FOCUS" -Force -ErrorAction SilentlyContinue
Write-Host "Test completed." -ForegroundColor Green

# Step 3: Create installer with Inno Setup
Write-Host ""
Write-Host "[3/3] Creating installer with Inno Setup..." -ForegroundColor Yellow
Write-Host ""

# Check if Inno Setup is installed
$innoSetupPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (Test-Path $innoSetupPath) {
    # Create installer output directory
    if (-not (Test-Path "dist\installer")) {
        New-Item -ItemType Directory -Path "dist\installer" | Out-Null
    }

    & $innoSetupPath build_scripts\installer.iss

    if (Test-Path "dist\installer\FOCUS_Setup_v1.0.0.exe") {
        Write-Host ""
        Write-Host "================================" -ForegroundColor Green
        Write-Host "BUILD COMPLETE!" -ForegroundColor Green
        Write-Host "================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Outputs:" -ForegroundColor Cyan
        Write-Host "  Executable: dist\FOCUS\FOCUS.exe"
        Write-Host "  Installer:  dist\installer\FOCUS_Setup_v1.0.0.exe"
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "Warning: Installer creation may have failed." -ForegroundColor Yellow
        Write-Host "Check the output above for errors."
    }
} else {
    Write-Host ""
    Write-Host "================================" -ForegroundColor Yellow
    Write-Host "PARTIAL BUILD COMPLETE" -ForegroundColor Yellow
    Write-Host "================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Executable created: dist\FOCUS\FOCUS.exe" -ForegroundColor Green
    Write-Host ""
    Write-Host "Inno Setup not found. To create an installer:" -ForegroundColor Yellow
    Write-Host "1. Download Inno Setup from: https://jrsoftware.org/isdl.php"
    Write-Host "2. Install Inno Setup 6"
    Write-Host "3. Run this command:"
    Write-Host '   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" build_scripts\installer.iss'
    Write-Host ""
}

Read-Host "Press Enter to continue"

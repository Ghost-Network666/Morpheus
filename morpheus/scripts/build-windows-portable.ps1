#Requires -Version 5.1
# Build Morpheus as a single Windows .exe using PyInstaller

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host "Building Morpheus portable .exe..." -ForegroundColor Cyan

# Activate venv
. ".\venv\Scripts\Activate.ps1"

# Install PyInstaller if needed
pip install pyinstaller pillow pystray -q

# Build
pyinstaller `
    --name "Morpheus" `
    --onefile `
    --windowed `
    --icon "app\static\favicon.ico" `
    --add-data "app\static;app\static" `
    --add-data ".env.example;." `
    --hidden-import "uvicorn.logging" `
    --hidden-import "uvicorn.loops.auto" `
    --hidden-import "uvicorn.protocols.http.auto" `
    --hidden-import "uvicorn.protocols.websockets.auto" `
    --hidden-import "uvicorn.lifespan.on" `
    --hidden-import "sqlalchemy.dialects.sqlite" `
    --hidden-import "aiosqlite" `
    --collect-all "fastapi" `
    scripts\launcher.py

Write-Host ""
Write-Host "Build complete: dist\Morpheus.exe" -ForegroundColor Green

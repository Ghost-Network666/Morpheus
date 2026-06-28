#Requires -Version 5.1
# Morpheus Windows Launcher
param(
    [switch]$NoGui,
    [switch]$Setup
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host ""
Write-Host "  Morpheus - Self-Hosted AI Workspace" -ForegroundColor Cyan
Write-Host ""

# Load .env
if (Test-Path ".env") {
    Get-Content ".env" | Where-Object { $_ -notmatch "^#" -and $_ -match "=" } | ForEach-Object {
        $parts = $_ -split "=", 2
        if ($parts.Count -eq 2 -and $parts[0].Trim()) {
            [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}

$AppPort = $env:APP_PORT ?? "7860"
$AppHost = $env:APP_HOST ?? "127.0.0.1"

# Check Python
$Python = $null
foreach ($cmd in @("python3.11", "python3", "python")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "3\.(\d+)" -and [int]$Matches[1] -ge 11) {
            $Python = $cmd
            break
        }
    } catch {}
}

if (-not $Python) {
    Write-Host "  [!] Python 3.11+ not found." -ForegroundColor Red
    Write-Host "  Download from: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host ""
    Start-Process "https://www.python.org/downloads/"
    Read-Host "Press Enter after installing Python to continue"
    $Python = "python"
}

Write-Host "  [*] Python: $Python" -ForegroundColor Green

# Virtualenv
if (-not (Test-Path "venv")) {
    Write-Host "  [*] Creating virtual environment..."
    & $Python -m venv venv
}

$activate = ".\venv\Scripts\Activate.ps1"
if (Test-Path $activate) {
    . $activate
} else {
    $env:PATH = ".\venv\Scripts;" + $env:PATH
}

# Install deps
Write-Host "  [*] Installing dependencies..."
& pip install -q -r requirements.txt

# First-run setup
if (-not (Test-Path "data\app.db") -or $Setup) {
    Write-Host "  [*] Running setup..."
    & python scripts\setup.py
}

$url = "http://localhost:$AppPort"
Write-Host ""
Write-Host "  [*] Starting Morpheus at $url" -ForegroundColor Cyan
Write-Host ""

if ($NoGui) {
    # Headless mode
    Start-Process $url
    & uvicorn app.main:app --host $AppHost --port $AppPort --workers 1
} else {
    # GUI launcher (splash + tray)
    & python scripts\launcher.py
}

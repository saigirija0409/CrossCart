# PowerShell launcher for CrossCart on Windows
param (
    [switch]$seed,
    [switch]$fresh
)

$ErrorActionPreference = "Stop"
$ROOT = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ROOT

$API_PORT = 8000
$WEB_PORT = 5173
$SEED_FLAG = $seed.IsPresent -or $fresh.IsPresent

if ($fresh.IsPresent) {
    if (Test-Path "data/app.db") {
        Remove-Item "data/app.db" -Force
        Write-Host "==> Removed data/app.db"
    }
}

if (-not (Test-Path "data/app.db")) {
    $SEED_FLAG = $true
}

# Resolve Python binary
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $python) {
    $python = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $python) {
    Write-Error "Python is required. Please install Python 3.11+."
    exit 1
}

# Check Node/npm
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Error "Node.js / npm is required. Please install Node.js."
    exit 1
}

Write-Host "==> python dependencies"
if (-not (Test-Path ".venv")) {
    & $python.Source -m venv .venv
}

$venvPython = Join-Path $ROOT ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    $venvPython = Join-Path $ROOT ".venv\bin\python"
}

& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r apps/api/requirements.txt

Write-Host "==> node dependencies"
npm --prefix apps/web install --silent --no-fund --no-audit

# Free ports
foreach ($port in @($API_PORT, $WEB_PORT)) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($conn in $conns) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

$logDir = [System.IO.Path]::GetTempPath()
$apiLog = Join-Path $logDir "crosscart-api.log"
$webLog = Join-Path $logDir "crosscart-web.log"

Write-Host "==> starting api on :$API_PORT"
$apiProcess = Start-Process -FilePath $venvPython -ArgumentList "-m uvicorn apps.api.app.main:app --port $API_PORT --app-dir ." -RedirectStandardOutput $apiLog -RedirectStandardError $apiLog -PassThru -NoNewWindow

# Wait for health check
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:$API_PORT/api/health" -UseBasicParsing -TimeoutSec 2
        if ($res.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        if ($apiProcess.HasExited) {
            Write-Error "API failed to start. Log output:`n$(Get-Content $apiLog -Tail 20)"
            exit 1
        }
    }
    Start-Sleep -Seconds 1
}

if ($SEED_FLAG) {
    Write-Host "==> seeding the demo wishlist"
    & $venvPython scripts/demo_seed.py "http://localhost:$API_PORT"
}

Write-Host "==> starting web on :$WEB_PORT"
$webProcess = Start-Process -FilePath "npm" -ArgumentList "--prefix apps/web run dev -- --port $WEB_PORT --strictPort" -RedirectStandardOutput $webLog -RedirectStandardError $webLog -PassThru -NoNewWindow

Write-Host @"

  CrossCart is running.

    app     http://localhost:$WEB_PORT
    api     http://localhost:$API_PORT/docs
    logs    $apiLog  $webLog

    demo    demo@wishlist.local  / Demo1234!
    admin   admin@wishlist.local / Admin1234!

  Load the Chrome extension (optional, for live store sync):
    chrome://extensions -> Developer mode -> Load unpacked -> $ROOT\apps\extension

  Press Ctrl+C or close window to stop.

"@

try {
    while (-not $apiProcess.HasExited -and -not $webProcess.HasExited) {
        Start-Sleep -Seconds 2
    }
} finally {
    if ($apiProcess -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($webProcess -and -not $webProcess.HasExited) { Stop-Process -Id $webProcess.Id -Force -ErrorAction SilentlyContinue }
}

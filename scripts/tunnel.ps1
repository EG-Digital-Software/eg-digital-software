# Live public link for local development.
#
# Starts the backend (:4000) and the frontend in tunnel mode (:3000), then opens
# a Cloudflare tunnel to the frontend. Because Vite proxies /api and /uploads to
# the backend, the whole app is served from ONE public https URL — no CORS, and
# it works from any device on any network. Edit code and the change shows live.
#
#   npm run tunnel        (from the repo root)
#
# Press Ctrl+C to stop everything.

#requires -Version 5
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cf = Join-Path $root 'tools\cloudflared.exe'

if (-not (Test-Path $cf)) {
  Write-Host "cloudflared.exe not found at $cf" -ForegroundColor Red
  Write-Host "Download the Windows build from:" -ForegroundColor Yellow
  Write-Host "  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -ForegroundColor Yellow
  Write-Host "and save it there as cloudflared.exe." -ForegroundColor Yellow
  exit 1
}

function Test-Port([int]$port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $port)
    $c.Close()
    return $true
  } catch { return $false }
}

$procs = @()
try {
  if (Test-Port 4000) {
    Write-Host "Backend already running on :4000 - reusing it." -ForegroundColor DarkGray
  } else {
    Write-Host "Starting backend on http://localhost:4000 ..." -ForegroundColor Cyan
    $procs += Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev:backend' -WorkingDirectory $root -PassThru
  }

  Write-Host "Starting frontend (tunnel mode) on http://localhost:3000 ..." -ForegroundColor Cyan
  $procs += Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev:tunnel' -WorkingDirectory $root -PassThru

  Write-Host "Waiting for the frontend to come up ..." -ForegroundColor Cyan
  $tries = 0
  while (-not (Test-Port 3000)) {
    Start-Sleep -Seconds 1
    if (++$tries -gt 90) { throw "Frontend did not start on :3000 within 90s" }
  }

  Write-Host ""
  Write-Host "==================================================================" -ForegroundColor Green
  Write-Host " Opening public tunnel - your live link appears below." -ForegroundColor Green
  Write-Host " Share the https://<...>.trycloudflare.com URL with any device." -ForegroundColor Green
  Write-Host " Press Ctrl+C to stop everything." -ForegroundColor Green
  Write-Host "==================================================================" -ForegroundColor Green
  Write-Host ""

  & $cf tunnel --url http://localhost:3000 --no-autoupdate
}
finally {
  Write-Host ""
  Write-Host "Shutting down dev servers ..." -ForegroundColor Yellow
  foreach ($p in $procs) {
    if ($p -and -not $p.HasExited) {
      # /T kills the whole tree (npm.cmd -> node), which Stop-Process alone misses.
      taskkill /PID $p.Id /T /F 2>$null | Out-Null
    }
  }
}

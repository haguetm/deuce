# Real import from your own machine (Windows PowerShell 5+ or PowerShell 7).
#
#   $env:PIPELINE_CONTACT = "you@example.org"   # or a URL; required by Wikimedia
#   .\pipeline\run-import.ps1                  # 200 players (mini catalogue)
#   .\pipeline\run-import.ps1 -Limit 500
#
# Prerequisites: Python 3.12+, git, and the local Supabase started at the repo
# root (`pnpm db:start`). DATABASE_URL is read from `supabase status` unless set.
param([int]$Limit = 200)
$ErrorActionPreference = "Stop"

$PipelineDir = $PSScriptRoot
$Root = Split-Path -Parent $PipelineDir

if (-not $env:PIPELINE_CONTACT) {
  Write-Error "PIPELINE_CONTACT is not set (email or URL used in the User-Agent)."
}

if (-not $env:DATABASE_URL) {
  Push-Location $Root
  try {
    $line = pnpm exec supabase status -o env | Where-Object { $_ -match '^DB_URL=' } | Select-Object -First 1
  } finally { Pop-Location }
  if (-not $line) { Write-Error "Could not read DB_URL from 'supabase status'. Run 'pnpm db:start' first." }
  $env:DATABASE_URL = ($line -replace '^DB_URL=', '').Trim('"')
}
if (-not $env:IMAGE_STORAGE_PROVIDER) { $env:IMAGE_STORAGE_PROVIDER = "local" }
if (-not $env:PIPELINE_MIN_INTERVAL_S) { $env:PIPELINE_MIN_INTERVAL_S = "1.0" }

$Venv = Join-Path $PipelineDir ".venv"
$Cli = Join-Path $Venv "Scripts\deuce-pipeline.exe"
if (-not (Test-Path $Cli)) {
  python -m venv $Venv
  & (Join-Path $Venv "Scripts\pip.exe") install --quiet -e $PipelineDir
}

# Sackmann datasets (CC BY-NC-SA 4.0, never committed). The original GitHub
# repositories were removed in 2026: archival mirror, same files and license.
& $Cli fetch-sackmann
if ($LASTEXITCODE -ne 0) { Write-Error "Sackmann archive download failed" }

Push-Location $PipelineDir
try { & $Cli import --limit $Limit } finally { Pop-Location }

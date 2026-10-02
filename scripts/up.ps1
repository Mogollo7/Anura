# Arranque de ANURA. Desde cualquier sitio:
#   .\scripts\up.ps1              servidor (web, panel, APIs). No toca el modelo de GPU.
#   .\scripts\up.ps1 -Model       lo mismo, y también el modelo.
#   .\scripts\up.ps1 -Build       reconstruye imágenes antes de levantar.
param(
  [switch]$Model,
  [switch]$Build
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$compose = @("compose")
if ($Model) { $compose += @("--profile", "model") }
$compose += @("up", "-d")
if ($Build) { $compose += "--build" }

Write-Host "Levantando ANURA. Postgres conserva sus datos. Cada servicio espera a que el anterior responda."
& docker @compose
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$expectUp = @(
  "anura_postgres", "anura_redis", "aistor-server", "anura_auth", "anura_observations",
  "anura_geo", "anura_thumbnails", "anura_explorer", "anura_notifications", "anura_dataset",
  "anura_validation", "anura_frontend", "anura_admin", "anura_npm", "anura_tunnel"
)
if ($Model) { $expectUp += "anura_model_service" }

Write-Host ""
docker compose ps -a --format "table {{.Name}}`t{{.Status}}"

$down = @()
foreach ($name in $expectUp) {
  $status = docker inspect -f "{{.State.Status}}" $name 2>$null
  if ($status -ne "running") { $down += "$name ($status)" }
}
foreach ($name in @("anura_db_migrate", "anura_minio_init")) {
  $status = docker inspect -f "{{.State.Status}}" $name 2>$null
  if ($status -eq "running") { continue }
  $code = docker inspect -f "{{.State.ExitCode}}" $name 2>$null
  if ($code -ne "0") { $down += "$name salió con código $code" }
}

if ($down.Count -gt 0) {
  Write-Host "Quedaron mal:" 
  $down | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "Listo. Web en el puerto 80, panel en http://localhost:3010"

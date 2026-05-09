$ROOT = "c:\user\OneDrive\Desktop\tareas\Anura"

Write-Host "=== Eliminando duplicados de la raiz ===" -ForegroundColor Yellow

# Carpetas raiz ya migradas al monorepo
$foldersToRemove = @(
  "scripts",          # → services/ai-service/training/ y app/utils/
  "data",             # → datasets/labeled/, datasets/raw/, ai-service/weights/
  "static",           # → frontend/src/styles/
  "templates",        # → frontend/public/
  "LOCALIZACION"      # → services/ai-service/app/contextual/
)

foreach ($folder in $foldersToRemove) {
  $path = Join-Path $ROOT $folder
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
    Write-Host "  [DEL] $folder/" -ForegroundColor Red
  }
}

Write-Host "`n=== Raiz final ===" -ForegroundColor Cyan
Get-ChildItem $ROOT -Depth 0 | Select-Object Name, @{N='Type';E={if($_.PSIsContainer){'DIR'}else{'FILE'}}}

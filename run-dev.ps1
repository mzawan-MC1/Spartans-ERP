$ErrorActionPreference = 'Stop'

$backendPort = 8000
$frontendPort = 3010

function Stop-PortProcess([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { return }
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    try {
      $proc = Get-Process -Id $processId -ErrorAction Stop
      Write-Host "Stopping PID $processId ($($proc.ProcessName)) on port $Port"
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      Write-Host "Could not stop PID $processId on port ${Port}: $($_.Exception.Message)"
    }
  }
}

function Assert-PortFree([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    throw "Port $Port is still in use by PID(s): $($pids -join ', '). Stop them and re-run."
  }
}

Stop-PortProcess $backendPort
Start-Sleep -Seconds 1
Stop-PortProcess $frontendPort
Start-Sleep -Milliseconds 300
Assert-PortFree $backendPort
Assert-PortFree $frontendPort

$rootDir = $PSScriptRoot
$backendDir = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"

$backendPython = Join-Path $backendDir ".venv\\Scripts\\python.exe"
if (-not (Test-Path $backendPython)) {
  throw "Backend venv python not found: $backendPython. Create it in backend folder: python -m venv .venv"
}

$localCors = "http://localhost:3010,http://localhost:3000,http://127.0.0.1:3010,http://127.0.0.1:3000"

$frontendUseYarn = Test-Path (Join-Path $frontendDir "yarn.lock")
$frontendStart = if ($frontendUseYarn) { "yarn start" } else { "npm start" }

$backendCmd = @(
  "cd /d `"$backendDir`"",
  "set ENVIRONMENT=local",
  "set COOKIE_SECURE=false",
  "set COOKIE_SAMESITE=lax",
  "set CORS_ORIGINS=$localCors",
  "`"$backendPython`" -m uvicorn server:app --host 0.0.0.0 --port $backendPort --reload"
) -join " && "

$frontendCmd = @(
  "cd /d `"$frontendDir`"",
  "set PORT=$frontendPort",
  "set REACT_APP_BACKEND_URL=http://localhost:$backendPort",
  $frontendStart
) -join " && "

Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $backendCmd) -WorkingDirectory $backendDir
Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $frontendCmd) -WorkingDirectory $frontendDir

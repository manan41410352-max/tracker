param(
  [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"

$resolvedProjectRoot = if ($ProjectRoot) {
  Resolve-Path -LiteralPath $ProjectRoot
} else {
  Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
}

$projectPath = $resolvedProjectRoot.Path
$nextBin = Join-Path $projectPath "node_modules\.bin\next.cmd"
$convexBin = Join-Path $projectPath "node_modules\.bin\convex.cmd"
$devDistDir = ".next-dev"
$devDistPath = Join-Path $projectPath $devDistDir
$port = 3000

if ($env:PORT -match '^\d+$') {
  $port = [int]$env:PORT
}

if (-not (Test-Path $nextBin)) {
  Write-Error "Next.js launcher was not found. Run install.cmd first."
  exit 1
}

if ((Test-Path $convexBin) -and ($env:CONVEX_DEPLOYMENT -or $env:NEXT_PUBLIC_CONVEX_URL)) {
  Write-Host "Syncing Convex functions before starting Next dev..."
  & $convexBin dev --once --typecheck disable
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Convex sync failed. Fix the Convex deployment issue before starting the app to avoid missing-function runtime errors."
    exit $LASTEXITCODE
  }
}

$existingServer = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
  ForEach-Object {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -like "*$projectPath*" -and $process.CommandLine -like "*start-server.js*") {
      $process
    }
  } |
  Select-Object -First 1

if ($existingServer) {
  Write-Host "Systematic Tracker is already running at http://localhost:$port"
  exit 0
}

$runningNodeProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
if ($runningNodeProcesses) {
  $runningNodeProcesses |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -like "*$projectPath*" -and
      ($_.CommandLine -like "*next\dist\bin\next* dev*" -or $_.CommandLine -like "*start-server.js*")
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force
    }
}

Start-Sleep -Seconds 1

if (Test-Path -LiteralPath $devDistPath) {
  # OneDrive-backed workspaces can expose Next output as reparse points that
  # Next's own cleanup misidentifies as symlinks on Windows.
  Remove-Item -LiteralPath $devDistPath -Recurse -Force
}

$env:NEXT_DEV_DIST_DIR = $devDistDir
& $nextBin dev
exit $LASTEXITCODE

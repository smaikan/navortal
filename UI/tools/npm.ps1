# Sistem kurulumunu değiştirmeden proje içindeki Node 24 kullanılır.
$ErrorActionPreference = 'Stop'
$taskUiRoot = Split-Path $PSScriptRoot -Parent
$taskNodeVersion = (Get-Content -LiteralPath (Join-Path $taskUiRoot '.node-version') -Raw).Trim()
$taskNodeDir = Join-Path $taskUiRoot ".local/node-v$taskNodeVersion-win-x64"
if (-not (Test-Path -LiteralPath (Join-Path $taskNodeDir 'node.exe'))) {
    throw "Node $taskNodeVersion is required. Install this version or prepare the project-local runtime described in ../README.md."
}
$taskPreviousPath = $env:PATH
try {
    $env:PATH = "$taskNodeDir;$env:PATH"
    Push-Location $taskUiRoot
    try { & (Join-Path $taskNodeDir 'npm.cmd') @args; $taskExit = $LASTEXITCODE } finally { Pop-Location }
} finally { $env:PATH = $taskPreviousPath }
exit $taskExit

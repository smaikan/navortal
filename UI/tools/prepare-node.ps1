$ErrorActionPreference = 'Stop'
$taskUiRoot = Split-Path $PSScriptRoot -Parent
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskUiRoot '.node-version') -Raw).Trim()
if ($taskVersion -notmatch '^24\.\d+\.\d+$') { throw 'Expected a pinned Node 24 version.' }
$taskLocalDir = Join-Path $taskUiRoot '.local'
$taskArchiveName = "node-v$taskVersion-win-x64.zip"
$taskArchive = Join-Path $taskLocalDir $taskArchiveName
$taskNodeDir = Join-Path $taskLocalDir "node-v$taskVersion-win-x64"
if (Test-Path -LiteralPath (Join-Path $taskNodeDir 'node.exe')) { Write-Output $taskNodeDir; exit 0 }
New-Item -ItemType Directory -Path $taskLocalDir -Force | Out-Null
$taskBaseUrl = "https://nodejs.org/dist/v$taskVersion/"
Invoke-WebRequest -Uri "$taskBaseUrl$taskArchiveName" -OutFile $taskArchive
$taskChecksums = (Invoke-WebRequest -Uri "${taskBaseUrl}SHASUMS256.txt").Content
$taskExpected = ($taskChecksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $taskArchiveName") } | Select-Object -First 1).Split(' ')[0]
if (-not $taskExpected -or (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash -ine $taskExpected) { throw 'Node archive SHA256 mismatch.' }
Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskLocalDir
Write-Output $taskNodeDir

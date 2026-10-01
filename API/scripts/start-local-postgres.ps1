param([int]$Port = 55432)
$ErrorActionPreference = 'Stop'
$apiRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $apiRoot '.local'
$bin = Join-Path $runtimeRoot 'pgsql\bin'
$data = Join-Path $runtimeRoot 'pgdata'
if (-not (Test-Path -LiteralPath (Join-Path $bin 'pg_ctl.exe'))) { throw 'Run install-local-postgres.ps1 first.' }
if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
    & (Join-Path $bin 'initdb.exe') -D $data -U postgres -A trust --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
}
if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
    & (Join-Path $bin 'pg_ctl.exe') -D $data status
    if ($LASTEXITCODE -eq 0) { Write-Output 'Project PostgreSQL already running.'; exit 0 }
}
$process = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D', ('"'+$data+'"'), '-l', ('"'+(Join-Path $runtimeRoot 'postgresql.log')+'"'), '-o', ('"-h 127.0.0.1 -p '+$Port+'"'), '-w', 'start') -WindowStyle Hidden -PassThru
# Windows'ta Start-Process -Wait veritabanının alt süreçlerini de bekliyor.
# Sadece pg_ctl'yi bekle. Sunucunun hazır olmasını zaten -w kontrol ediyor.
$process.WaitForExit()
if ($process.ExitCode -ne 0) { throw 'Project PostgreSQL could not start; check .local/postgresql.log' }
Write-Output "Project-only PostgreSQL listening on 127.0.0.1:$Port (development/test only)."

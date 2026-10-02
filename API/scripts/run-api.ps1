param([string]$Urls = 'http://127.0.0.1:5080')
$ErrorActionPreference = 'Stop'
$apiRoot = Split-Path $PSScriptRoot -Parent
$oldKey = $env:Jwt__SigningKey
$oldEnvironment = $env:ASPNETCORE_ENVIRONMENT
$oldPushSubject = $env:Push__Subject
$oldPushPublicKey = $env:Push__PublicKey
$oldPushPrivateKey = $env:Push__PrivateKey
try {
    if (-not $env:Jwt__SigningKey) {
        $local = Join-Path $apiRoot '.local'
        New-Item -ItemType Directory -Path $local -Force | Out-Null
        $keyFile = Join-Path $local 'jwt-signing.key'
        if (-not (Test-Path -LiteralPath $keyFile)) {
            [IO.File]::WriteAllText($keyFile,[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)))
        }
        $env:Jwt__SigningKey = [IO.File]::ReadAllText($keyFile).Trim()
    }
    if (-not $env:ASPNETCORE_ENVIRONMENT) { $env:ASPNETCORE_ENVIRONMENT = 'Development' }
    $pushPath = Join-Path $apiRoot '.local/web-push.json'
    if ($env:Push__Enabled -eq 'true' -and (Test-Path -LiteralPath $pushPath)) {
        $pushKeys = Get-Content -LiteralPath $pushPath -Raw | ConvertFrom-Json
        if (-not $env:Push__Subject) { $env:Push__Subject = $pushKeys.Subject }
        if (-not $env:Push__PublicKey) { $env:Push__PublicKey = $pushKeys.PublicKey }
        if (-not $env:Push__PrivateKey) { $env:Push__PrivateKey = $pushKeys.PrivateKey }
    }
    & dotnet run --project (Join-Path $apiRoot 'src/Adhd.Api') --no-launch-profile --urls $Urls
    if ($LASTEXITCODE -ne 0) { throw 'API process exited unsuccessfully.' }
} finally {
    $env:Jwt__SigningKey = $oldKey
    $env:ASPNETCORE_ENVIRONMENT = $oldEnvironment
    $env:Push__Subject = $oldPushSubject
    $env:Push__PublicKey = $oldPushPublicKey
    $env:Push__PrivateKey = $oldPushPrivateKey
}

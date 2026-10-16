param([string]$Urls = 'http://127.0.0.1:5080', [switch]$EnablePush)
$ErrorActionPreference = 'Stop'
$apiRoot = Split-Path $PSScriptRoot -Parent
$oldKey = $env:Jwt__SigningKey
$oldEnvironment = $env:ASPNETCORE_ENVIRONMENT
$oldPushSubject = $env:Push__Subject
$oldPushPublicKey = $env:Push__PublicKey
$oldPushPrivateKey = $env:Push__PrivateKey
$oldPushEnabled = $env:Push__Enabled
$cloudinaryKeys = @('Cloudinary__Enabled','Cloudinary__CloudName','Cloudinary__ApiKey','Cloudinary__ApiSecret')
$oldCloudinary = @{}
foreach ($cloudinaryKey in $cloudinaryKeys) { $oldCloudinary[$cloudinaryKey] = [Environment]::GetEnvironmentVariable($cloudinaryKey, 'Process') }
try {
    # Bu dosyada düz değerler var. Çalıştırmadan ve ekrana basmadan oku.
    $cloudinaryEnvPath = Join-Path $apiRoot '.local/cloudinary.env'
    if (Test-Path -LiteralPath $cloudinaryEnvPath) {
        foreach ($cloudinaryLine in [IO.File]::ReadAllLines($cloudinaryEnvPath)) {
            if ([string]::IsNullOrWhiteSpace($cloudinaryLine) -or $cloudinaryLine.TrimStart().StartsWith('#')) { continue }
            $cloudinaryPair = $cloudinaryLine.Split('=', 2)
            if ($cloudinaryPair.Length -ne 2 -or $cloudinaryKeys -notcontains $cloudinaryPair[0]) { throw 'Invalid Cloudinary environment file entry.' }
            if (-not [Environment]::GetEnvironmentVariable($cloudinaryPair[0], 'Process')) { [Environment]::SetEnvironmentVariable($cloudinaryPair[0], $cloudinaryPair[1], 'Process') }
        }
    }
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
    if ($EnablePush) { $env:Push__Enabled = 'true' }
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
    $env:Push__Enabled = $oldPushEnabled
    foreach ($cloudinaryKey in $cloudinaryKeys) { [Environment]::SetEnvironmentVariable($cloudinaryKey, $oldCloudinary[$cloudinaryKey], 'Process') }
}

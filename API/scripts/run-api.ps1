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
$smtpKeys = @('Smtp__Enabled','Smtp__Host','Smtp__Port','Smtp__Security','Smtp__Username','Smtp__Password','Smtp__From','Smtp__ResetPageUrl')
$oldSmtp = @{}
foreach ($smtpKey in $smtpKeys) { $oldSmtp[$smtpKey] = [Environment]::GetEnvironmentVariable($smtpKey, 'Process') }
try {
    $smtpEnvPath = Join-Path $apiRoot '.local/smtp.env'
    if (Test-Path -LiteralPath $smtpEnvPath) {
        foreach ($smtpLine in [IO.File]::ReadAllLines($smtpEnvPath)) {
            if ([string]::IsNullOrWhiteSpace($smtpLine) -or $smtpLine.TrimStart().StartsWith('#')) { continue }
            $smtpPair = $smtpLine.Split('=', 2)
            if ($smtpPair.Length -ne 2 -or $smtpKeys -notcontains $smtpPair[0]) { throw 'Invalid SMTP environment file entry.' }
            if (-not [Environment]::GetEnvironmentVariable($smtpPair[0], 'Process')) { [Environment]::SetEnvironmentVariable($smtpPair[0], $smtpPair[1], 'Process') }
        }
    }
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
    foreach ($smtpKey in $smtpKeys) { [Environment]::SetEnvironmentVariable($smtpKey, $oldSmtp[$smtpKey], 'Process') }
}

param([Parameter(Mandatory=$true)][string]$Subject)
$ErrorActionPreference = 'Stop'
$subjectUri = $null
if (-not [Uri]::TryCreate($Subject,[UriKind]::Absolute,[ref]$subjectUri) -or $subjectUri.Scheme -notin @('mailto','https')) { throw 'Subject must be an HTTPS or mailto contact URI.' }
$apiRoot = Split-Path $PSScriptRoot -Parent
$localPath = Join-Path $apiRoot '.local'
$keyPath = Join-Path $localPath 'web-push.json'
if (Test-Path -LiteralPath $keyPath) { Write-Output 'Existing VAPID keys preserved in API/.local/web-push.json.'; return }
New-Item -ItemType Directory -Path $localPath -Force | Out-Null
function ConvertTo-Base64Url([byte[]]$Value) { return [Convert]::ToBase64String($Value).TrimEnd('=').Replace('+','-').Replace('/','_') }
$pair = $null
try {
    try { $pair = [Security.Cryptography.ECDsa]::Create([Security.Cryptography.ECCurve]::CreateFromFriendlyName('nistP256')) }
    catch { $pair = [Security.Cryptography.ECDsaCng]::new(256) }
    if ($null -eq $pair) { $pair = [Security.Cryptography.ECDsaCng]::new(256) }
    $parameters = $pair.ExportParameters($true)
    if ($parameters.Q.X.Length -ne 32 -or $parameters.Q.Y.Length -ne 32 -or $parameters.D.Length -ne 32) { throw 'P-256 key generation failed.' }
    $challenge = [Text.Encoding]::UTF8.GetBytes('adhd.local-vapid-key-check')
    $signature = $pair.SignData($challenge,[Security.Cryptography.HashAlgorithmName]::SHA256)
    if (-not $pair.VerifyData($challenge,$signature,[Security.Cryptography.HashAlgorithmName]::SHA256)) { throw 'P-256 signature verification failed.' }
    $publicBytes = [byte[]]::new(65)
    $publicBytes[0] = 4
    [Array]::Copy($parameters.Q.X,0,$publicBytes,1,32)
    [Array]::Copy($parameters.Q.Y,0,$publicBytes,33,32)
    $settings = @{ Subject=$Subject; PublicKey=(ConvertTo-Base64Url $publicBytes); PrivateKey=(ConvertTo-Base64Url $parameters.D) }
    # İki kurulum aynı anda çalışırsa CreateNew mevcut anahtarları korur.
    $file = [IO.File]::Open($keyPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $encoded = [Text.Encoding]::UTF8.GetBytes(($settings | ConvertTo-Json))
        $file.Write($encoded,0,$encoded.Length)
    } finally { $file.Dispose() }
    Write-Output 'VAPID keys created in ignored API/.local/web-push.json. Keep this file private and preserve it across restarts.'
} finally { if ($null -ne $pair) { $pair.Dispose() } }

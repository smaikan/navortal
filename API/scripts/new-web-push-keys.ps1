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
$pair = [Security.Cryptography.ECDsa]::Create([Security.Cryptography.ECCurve]::NamedCurves.nistP256)
try {
    $parameters = $pair.ExportParameters($true)
    $publicBytes = [byte[]]::new(65)
    $publicBytes[0] = 4
    [Array]::Copy($parameters.Q.X,0,$publicBytes,1,32)
    [Array]::Copy($parameters.Q.Y,0,$publicBytes,33,32)
    $settings = @{ Subject=$Subject; PublicKey=(ConvertTo-Base64Url $publicBytes); PrivateKey=(ConvertTo-Base64Url $parameters.D) }
    [IO.File]::WriteAllText($keyPath,($settings | ConvertTo-Json))
    Write-Output 'VAPID keys created in ignored API/.local/web-push.json. Keep this file private and preserve it across restarts.'
} finally { $pair.Dispose() }

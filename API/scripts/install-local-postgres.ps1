$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path (Split-Path $PSScriptRoot -Parent) '.local'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$archive = Join-Path $runtimeRoot 'postgresql-18.6-5-windows-x64-binaries.zip'
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest 'https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip' -OutFile $archive
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
try {
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -notmatch '^pgsql/(bin|lib|share)/' -or $entry.FullName.EndsWith('/')) { continue }
        $target = [IO.Path]::GetFullPath((Join-Path $runtimeRoot $entry.FullName))
        if (-not $target.StartsWith(([IO.Path]::GetFullPath($runtimeRoot)+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive path' }
        New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
    }
} finally { $zip.Dispose() }
& (Join-Path $runtimeRoot 'pgsql\bin\postgres.exe') --version

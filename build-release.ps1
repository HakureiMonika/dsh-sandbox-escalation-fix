[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$releaseTarball = '.\release\dsh-sandbox-escalation-fix-0.1.1-desktop.1.tgz'
$releaseZip = Join-Path $PSScriptRoot 'release\dsh-sandbox-escalation-fix-0.1.1-desktop.1-release.zip'

# ??? npm pack ???? package.json ????? PowerShell ?? JSON ????????????
# ????????????release ?????????????? npm pack ???????
Remove-Item -Path '.\release\dsh-sandbox-escalation-fix-*.tgz' -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $releaseZip -Force -ErrorAction SilentlyContinue

# ???????? lib??? npm ?????? tgz ????? release ???
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm pack --pack-destination .\release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath $releaseTarball -PathType Leaf)) { throw "Expected release tarball was not generated: $releaseTarball" }

# ??????????????? tarball ?????????? ZIP ????????
# Release ?? ASCII ???????? Windows ??????????????????
Copy-Item -Path .\install-release.ps1 -Destination .\release\install-release.ps1 -Force
Copy-Item -Path .\uninstall-release.ps1 -Destination .\release\uninstall-release.ps1 -Force
Copy-Item -Path .\RELEASE-USAGE.zh.md -Destination .\release\RELEASE-USAGE.zh.md -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::Open($releaseZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($name in @('dsh-sandbox-escalation-fix-0.1.1-desktop.1.tgz', 'install-release.ps1', 'uninstall-release.ps1', 'RELEASE-USAGE.zh.md')) {
    $source = Join-Path $PSScriptRoot "release\$name"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $archive.Dispose()
}
if (-not (Test-Path -LiteralPath $releaseZip -PathType Leaf)) { throw 'Release ZIP was not generated.' }

Write-Output 'Release bundle created: .\release\dsh-sandbox-escalation-fix-0.1.1-desktop.1-release.zip'
exit $LASTEXITCODE

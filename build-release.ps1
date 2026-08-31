[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$releaseTarball = '.\release\dsh-sandbox-escalation-fix-0.1.2-alpha2.1.tgz'
$releaseZip = Join-Path $PSScriptRoot 'release\dsh-sandbox-escalation-fix-0.1.2-alpha2.1-release.zip'

# 直接使用 npm pack 根据 package.json 生成标准包名，避免依赖不同 PowerShell 版本的 JSON 对象适配行为。
# 构建前清理旧 tarball 和本版本 ZIP，确保后续校验对应本次新生成的唯一产物。
Remove-Item -Path '.\release\dsh-sandbox-escalation-fix-*.tgz' -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $releaseZip -Force -ErrorAction SilentlyContinue

# 先重新构建 lib，再通过 npm 生成 tgz；任一外部命令失败都立即返回原退出码。
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm pack --pack-destination .\release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath $releaseTarball -PathType Leaf)) { throw "Expected release tarball was not generated: $releaseTarball" }

# 把安装、卸载脚本和中文说明复制到 release 目录，再与本次 tarball 一起写入 ZIP。
# ZIP 内部文件名只使用 ASCII，避免不同 Windows 解压环境对中文路径的兼容差异。
Copy-Item -Path .\install-release.ps1 -Destination .\release\install-release.ps1 -Force
Copy-Item -Path .\uninstall-release.ps1 -Destination .\release\uninstall-release.ps1 -Force
Copy-Item -Path .\RELEASE-USAGE.zh.md -Destination .\release\RELEASE-USAGE.zh.md -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::Open($releaseZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($name in @('dsh-sandbox-escalation-fix-0.1.2-alpha2.1.tgz', 'install-release.ps1', 'uninstall-release.ps1', 'RELEASE-USAGE.zh.md')) {
    $source = Join-Path $PSScriptRoot "release\$name"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $archive.Dispose()
}
if (-not (Test-Path -LiteralPath $releaseZip -PathType Leaf)) { throw 'Release ZIP was not generated.' }

Write-Output 'Release bundle created: .\release\dsh-sandbox-escalation-fix-0.1.2-alpha2.1-release.zip'
exit $LASTEXITCODE

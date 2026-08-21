[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$releaseTarball = '.\release\dsh-sandbox-escalation-fix-0.1.1-rc1.tgz'
$releaseZip = Join-Path $PSScriptRoot 'release\dsh-sandbox-escalation-fix-0.1.1-rc1-release.zip'

# 版本由 npm pack 直接依据 package.json 生成，避免 PowerShell 解析 JSON 元数据时出现兼容性问题。
# 仅清理当前插件的旧产物；release 首次不存在时静默跳过，随后由 npm pack 创建输出目录。
Remove-Item -Path '.\release\dsh-sandbox-escalation-fix-*.tgz' -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $releaseZip -Force -ErrorAction SilentlyContinue

# 先编译发布所需的 lib，再把 npm 生成的版本化 tgz 直接输出到 release 目录。
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm pack --pack-destination .\release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath $releaseTarball -PathType Leaf)) { throw "Expected release tarball was not generated: $releaseTarball" }

# 安装、卸载和简明使用说明必须与 tarball 同目录，用户解压单个 ZIP 后即可完成操作。
# Release 使用 ASCII 文件名，避免不同 Windows 终端在中文文件名路径编码上产生歧义。
Copy-Item -Path .\install-release.ps1 -Destination .\release\install-release.ps1 -Force
Copy-Item -Path .\uninstall-release.ps1 -Destination .\release\uninstall-release.ps1 -Force
Copy-Item -Path .\RELEASE-USAGE.zh.md -Destination .\release\RELEASE-USAGE.zh.md -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($releaseZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($name in @('dsh-sandbox-escalation-fix-0.1.1-rc1.tgz', 'install-release.ps1', 'uninstall-release.ps1', 'RELEASE-USAGE.zh.md')) {
    $source = Join-Path $PSScriptRoot "release\$name"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $archive.Dispose()
}
if (-not (Test-Path -LiteralPath $releaseZip -PathType Leaf)) { throw 'Release ZIP was not generated.' }

Write-Output 'Release bundle created: .\release\dsh-sandbox-escalation-fix-0.1.1-rc1-release.zip'
exit $LASTEXITCODE

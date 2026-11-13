[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# 直接使用 npm pack 根据 package.json 生成标准包名，避免依赖不同 PowerShell 版本的 JSON 对象适配行为。
# 构建前清理旧 tarball 和旧 ZIP，确保后续校验对应本次新生成的唯一产物。
Remove-Item -Path '.\release\dsh-sandbox-escalation-fix-*.tgz' -Force -ErrorAction SilentlyContinue
Remove-Item -Path '.\release\dsh-sandbox-escalation-fix-*-release.zip' -Force -ErrorAction SilentlyContinue

# 先重新构建 lib，再通过 npm 生成 tgz；显式调用 npm.cmd，避免嵌套 PowerShell 误解析 npm.ps1 包装器。
# 两个外部命令都检查原始退出码，构建或打包任一步失败时立即终止，不生成伪成功的 Release ZIP。
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm.cmd pack --pack-destination .\release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 版本号只在 package.json 里维护：tarball 名由 npm pack 决定，ZIP 名从 tarball 名派生，脚本内不再硬编码版本。
$tarballs = @(Get-ChildItem -Path .\release -Filter 'dsh-sandbox-escalation-fix-*.tgz' -File)
if ($tarballs.Count -ne 1) { throw "Expected exactly one release tarball in .\release, found $($tarballs.Count)" }
$tarballName = $tarballs[0].Name
$releaseZip = Join-Path $PSScriptRoot "release\$([System.IO.Path]::GetFileNameWithoutExtension($tarballName))-release.zip"

# 把安装、卸载脚本和中文说明复制到 release 目录，再与本次 tarball 一起写入 ZIP。
# ZIP 内部文件名只使用 ASCII，避免不同 Windows 解压环境对中文路径的兼容差异。
# .sh 脚本由 .gitattributes 固定为 LF 行尾，且复制为字节级操作，ZIP 内保持 LF 以便 Linux 直接使用。
Copy-Item -Path .\install-release.ps1 -Destination .\release\install-release.ps1 -Force
Copy-Item -Path .\uninstall-release.ps1 -Destination .\release\uninstall-release.ps1 -Force
Copy-Item -Path .\install-release.sh -Destination .\release\install-release.sh -Force
Copy-Item -Path .\uninstall-release.sh -Destination .\release\uninstall-release.sh -Force
Copy-Item -Path .\RELEASE-USAGE.zh.md -Destination .\release\RELEASE-USAGE.zh.md -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::Open($releaseZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($name in @($tarballName, 'install-release.ps1', 'uninstall-release.ps1', 'install-release.sh', 'uninstall-release.sh', 'RELEASE-USAGE.zh.md')) {
    $source = Join-Path $PSScriptRoot "release\$name"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $archive.Dispose()
}
if (-not (Test-Path -LiteralPath $releaseZip -PathType Leaf)) { throw 'Release ZIP was not generated.' }

Write-Output "Release bundle created: $releaseZip"
exit $LASTEXITCODE

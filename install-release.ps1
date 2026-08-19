[CmdletBinding()]
param(
  [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'
$packageName = 'dsh-sandbox-escalation-fix'
$tarballs = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter "$packageName-*.tgz" -File)

# Release 目录必须只有一个目标包；找不到包或混入多个版本时停止，避免向 DSH CLI 传递错误路径。
if ($tarballs.Count -ne 1) { throw "Expected exactly one $packageName-*.tgz beside this script, found $($tarballs.Count)." }
$tarball = $tarballs[0]

Write-Output "Installing $($tarball.Name) into profile '$Profile'."
# DSH CLI 负责将本地 tgz 安装到 Profile，并在 pnpm 成功后同步 dsh.bundle patch 层。
& dsh plugin --profile $Profile add $tarball.FullName
Write-Output "DSH plugin installation finished with exit code $LASTEXITCODE. Restart DSH before use."
exit $LASTEXITCODE

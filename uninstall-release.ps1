[CmdletBinding()]
param(
  [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'
$packageName = 'dsh-sandbox-escalation-fix'

Write-Output "Removing $packageName from profile '$Profile'."
# DSH CLI 负责移除 Profile 依赖，并在成功后从 dsh.bundle patch 层删除该插件。
& dsh plugin --profile $Profile remove $packageName
Write-Output "DSH plugin removal finished with exit code $LASTEXITCODE. Restart DSH before use."
exit $LASTEXITCODE

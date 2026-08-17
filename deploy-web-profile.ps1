$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'lib'
$dshHome = if ($env:DSH_HOME) {
  $env:DSH_HOME
} else {
  Join-Path $env:USERPROFILE '.dsh'
}
$target = Join-Path $dshHome 'profiles\web\node_modules\dsh-sandbox-escalation-fix\lib'
$names = @(
  'index.mjs',
  'index.mjs.map',
  'index.d.mts',
  'index.d.mts.map',
  'wrapper-protocol.mjs',
  'wrapper-protocol.mjs.map',
  'wrapper-protocol.d.mts',
  'wrapper-protocol.d.mts.map'
)

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "Built lib directory not found: $source"
}
if (-not (Test-Path -LiteralPath $target -PathType Container)) {
  throw "Installed Web Profile plugin lib directory not found: $target"
}

foreach ($name in $names) {
  Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $target $name) -Force
}

foreach ($name in $names) {
  $sourceHash = (Get-FileHash (Join-Path $source $name) -Algorithm SHA256).Hash
  $targetHash = (Get-FileHash (Join-Path $target $name) -Algorithm SHA256).Hash
  if ($sourceHash -ne $targetHash) {
    throw "Hash mismatch: $name"
  }
  Write-Output "$name $targetHash"
}

Write-Output 'Deployment verified.'

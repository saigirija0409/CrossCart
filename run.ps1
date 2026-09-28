# Delegate execution to scripts/run.ps1
$scriptPath = Join-Path $PSScriptRoot "scripts\run.ps1"
& $scriptPath @PSBoundParameters

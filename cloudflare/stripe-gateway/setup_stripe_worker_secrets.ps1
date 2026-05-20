param(
  [ValidateSet("A","B","All")]
  [string]$Stage = "All"
)
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
if ($Stage -eq "A" -or $Stage -eq "All") { & ".\install_stage_a_secrets.ps1" }
if ($Stage -eq "B" -or $Stage -eq "All") { & ".\install_stage_b_webhook_secret.ps1" }

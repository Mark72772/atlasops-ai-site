param()
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
Write-Host "Sprint 85 secure activation flow. Secret prompts stay in terminal only."
& ".\install_stage_a_secrets.ps1"
& ".\deploy_stripe_worker.ps1"
& ".\create_stripe_webhook_endpoint.ps1"
& ".\deploy_stripe_worker.ps1"
& ".\test_stripe_worker.ps1"

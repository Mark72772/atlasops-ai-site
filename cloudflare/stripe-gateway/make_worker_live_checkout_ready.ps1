param()
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
$WorkerUrl = "https://atlasops-stripe-gateway.atlasops-ai.workers.dev"

Write-Host "AtlasOps live checkout readiness runner."
Write-Host "Do not paste Stripe, webhook, or relay secrets into chat, Codex, reports, or files."
Write-Host "Paste secrets only into the secure prompts opened by this terminal."
Write-Host ""

$confirm = Read-Host "Type LIVE-APPROVED to confirm Mark approves live checkout activation after key rotation"
if ($confirm -ne "LIVE-APPROVED") { throw "stripe_live_checkout_requires_mark_approval" }

& ".\install_stage_a_secrets.ps1" -Mode live
& ".\deploy_stripe_worker.ps1"
& ".\create_stripe_webhook_endpoint.ps1"
& ".\deploy_stripe_worker.ps1"
& ".\test_stripe_worker.ps1" -WorkerUrl $WorkerUrl -UseUserEnvAdminSecret

$report = [ordered]@{
  ok = $true
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  mode = "live"
  live_checkout_approved = $true
  worker_url = $WorkerUrl
  secret_values_printed = $false
  secret_values_written_to_disk = $false
  exact_gate = $null
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-live-checkout-readiness.redacted.json"
$report | ConvertTo-Json

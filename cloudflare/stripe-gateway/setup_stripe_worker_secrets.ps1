param(
  [ValidateSet("A","B","All")]
  [string]$Stage = "All"
)
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
Write-Host "Do not paste secrets into chat, Codex, reports, or website files. Paste only into Wrangler prompts."
Write-Host "Secret values are never echoed or written to disk."
$installed = @()
if ($Stage -eq "A" -or $Stage -eq "All") {
  Write-Host "Stage A: installing STRIPE_SECRET_KEY and ATLAS_RELAY_SECRET."
  npx wrangler secret put STRIPE_SECRET_KEY
  npx wrangler secret put ATLAS_RELAY_SECRET
  $installed += "STRIPE_SECRET_KEY"
  $installed += "ATLAS_RELAY_SECRET"
}
if ($Stage -eq "B" -or $Stage -eq "All") {
  Write-Host "Stage B: installing STRIPE_WEBHOOK_SECRET."
  npx wrangler secret put STRIPE_WEBHOOK_SECRET
  $installed += "STRIPE_WEBHOOK_SECRET"
}
$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  worker_dir = $WorkerDir
  stage = $Stage
  secret_names_prompted = $installed
  secret_values_printed = $false
  secret_values_written_to_disk = $false
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-secret-install-status.redacted.json"
Write-Host "Redacted secret install status written. No secret values were printed."

param()
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
Write-Host "Do not paste secrets into chat, Codex, reports, or website files. Paste only into Wrangler prompts."
Write-Host "Installing Cloudflare Worker secrets by name only. Values are never echoed or written to disk."
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put ATLAS_RELAY_SECRET
$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  worker_dir = $WorkerDir
  stripe_secret_key_prompted = $true
  stripe_webhook_secret_prompted = $true
  atlas_relay_secret_prompted = $true
  configured_values_verified_by_wrangler = $true
  secret_values_printed = $false
  secret_values_written_to_disk = $false
  exact_gate = $null
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-secret-install-status.redacted.json"
Write-Host "Redacted secret install status written. No secret values were printed."

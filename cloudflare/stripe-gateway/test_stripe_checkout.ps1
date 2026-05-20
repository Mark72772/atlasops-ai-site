param([string]$WorkerUrl = "")
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
if (-not $WorkerUrl) { $WorkerUrl = Read-Host "Worker URL" }
$WorkerUrl = $WorkerUrl.TrimEnd("/")
$mode = $env:ATLAS_STRIPE_MODE
if (-not $mode) { $mode = "test" }
if ($mode -ne "test") { throw "Test checkout script only runs when ATLAS_STRIPE_MODE=test." }
$body = @{
  pack_id = "social-publishing-guardrail"
  source = "guardrail_store"
  success_base_url = "https://mark72772.github.io/atlasops-ai-site"
  cancel_base_url = "https://mark72772.github.io/atlasops-ai-site"
} | ConvertTo-Json
$response = Invoke-WebRequest -UseBasicParsing -Uri "$WorkerUrl/stripe/create-checkout-session" -Method POST -Body $body -ContentType "application/json"
$data = $response.Content | ConvertFrom-Json
$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  checkout_session_created = [bool]$data.checkout_url
  checkout_url_exists = [bool]$data.checkout_url
  checkout_url_is_payment_proof = $false
  payment_verified = $false
  download_token_created = $false
  email_delivery_sent = $false
  live_revenue = 0
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-test-checkout.redacted.json"
Write-Host "Checkout URL was created if the Worker returned one. It is not payment proof."

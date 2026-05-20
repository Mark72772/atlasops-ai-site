param(
  [string]$WorkerUrl = "https://atlasops-stripe-gateway.atlasops-ai.workers.dev"
)
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
$WebhookUrl = $WorkerUrl.TrimEnd("/") + "/stripe/webhook"

function ConvertFrom-SecureStringInMemory([SecureString]$Secret) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Install-WorkerSecretPlain([string]$Name, [string]$PlainSecret) {
  try {
    $PlainSecret | cmd /c "npx wrangler secret put $Name 2>&1" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Wrangler failed to install $Name" }
  } finally {
    $PlainSecret = $null
    [GC]::Collect()
  }
}

Write-Host "Creating Stripe webhook endpoint for $WebhookUrl"
Write-Host "Paste a safe Stripe test secret key, or a rotated live/restricted key, only into this secure prompt."
$stripeSecretSecure = Read-Host "Stripe API key for webhook endpoint creation" -AsSecureString
$stripeSecret = ConvertFrom-SecureStringInMemory $stripeSecretSecure
$endpoint = $null
try {
  $events = @("checkout.session.completed","payment_intent.succeeded","payment_intent.payment_failed","charge.refunded")
  $pairs = @("url=$([uri]::EscapeDataString($WebhookUrl))")
  foreach ($event in $events) { $pairs += "enabled_events[]=$([uri]::EscapeDataString($event))" }
  $body = $pairs -join "&"
  $headers = @{ Authorization = "Bearer $stripeSecret"; "Stripe-Version" = "2026-02-25.clover" }
  $endpoint = Invoke-RestMethod -Method Post -Uri "https://api.stripe.com/v1/webhook_endpoints" -Headers $headers -Body $body -ContentType "application/x-www-form-urlencoded"
  if (-not $endpoint.secret) { throw "Stripe response did not include webhook signing secret." }
  Install-WorkerSecretPlain "STRIPE_WEBHOOK_SECRET" $endpoint.secret
  $report = [ordered]@{
    ok = $true
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    webhook_endpoint_created = $true
    webhook_endpoint_id = $endpoint.id
    webhook_url = $WebhookUrl
    webhook_secret_installed = $true
    webhook_secret_printed = $false
    webhook_secret_written_to_disk = $false
    exact_gate = $null
  }
} catch {
  $report = [ordered]@{
    ok = $true
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    webhook_endpoint_created = $false
    webhook_url = $WebhookUrl
    webhook_secret_installed = $false
    webhook_secret_printed = $false
    webhook_secret_written_to_disk = $false
    error_redacted = $_.Exception.Message
    exact_gate = "stripe_webhook_endpoint_api_create_failed_or_dashboard_required"
  }
} finally {
  $stripeSecret = $null
  if ($endpoint) { $endpoint.secret = $null }
  [GC]::Collect()
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-webhook-endpoint-status.redacted.json"
$report | ConvertTo-Json

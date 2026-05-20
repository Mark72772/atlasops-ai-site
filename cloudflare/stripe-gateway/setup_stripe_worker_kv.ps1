param()
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
Write-Host "Creating Cloudflare KV namespace ATLAS_PAYMENTS. No secrets are requested by this script."
$output = npx wrangler kv namespace create ATLAS_PAYMENTS 2>&1
$output | Tee-Object -FilePath ".\stripe-worker-kv-create-output.redacted.txt"
$namespaceId = $null
foreach ($line in $output) {
  if ($line -match 'id\s*=\s*"([^"]+)"') { $namespaceId = $Matches[1] }
  elseif ($line -match '"id"\s*:\s*"([^"]+)"') { $namespaceId = $Matches[1] }
}
if (-not $namespaceId) {
  $report = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    worker_dir = $WorkerDir
    kv_namespace_created = $false
    wrangler_toml_updated = $false
    exact_gate = "stripe_worker_kv_namespace_missing"
  }
  $report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-kv-status.redacted.json"
  throw "KV namespace id was not detected. wrangler.toml was not changed."
}
$toml = Get-Content ".\wrangler.toml" -Raw
if ($toml -notmatch '\[\[kv_namespaces\]\]') {
  $toml = $toml.TrimEnd() + "`n`n[[kv_namespaces]]`nbinding = `"ATLAS_PAYMENTS`"`nid = `"$namespaceId`"`n"
} else {
  $toml = $toml -replace '#?\s*binding\s*=\s*"ATLAS_PAYMENTS"', 'binding = "ATLAS_PAYMENTS"'
  $toml = $toml -replace '#?\s*id\s*=\s*"<cloudflare-kv-namespace-id>"', "id = `"$namespaceId`""
}
Set-Content ".\wrangler.toml" -Value $toml -Encoding utf8
$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  worker_dir = $WorkerDir
  kv_namespace_created = $true
  wrangler_toml_updated = $true
  namespace_id_recorded = $true
  namespace_id_printed = $false
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-kv-status.redacted.json"
Write-Host "KV binding updated in wrangler.toml. Namespace id was recorded, not printed in this report."

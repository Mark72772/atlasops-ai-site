param()
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
Write-Host "Creating or binding Cloudflare KV namespace ATLAS_PAYMENTS. No secrets are requested by this script."
$output = npx wrangler kv namespace create ATLAS_PAYMENTS 2>&1
$output | Tee-Object -FilePath ".\stripe-worker-kv-create-output.redacted.txt"
$namespaceId = $null
foreach ($line in $output) {
  if ($line -match 'id\s*=\s*"([^"]+)"') { $namespaceId = $Matches[1] }
  elseif ($line -match '"id"\s*:\s*"([^"]+)"') { $namespaceId = $Matches[1] }
}
if (-not $namespaceId) {
  $manual = Read-Host "If ATLAS_PAYMENTS already exists, paste the namespace id from Cloudflare/Wrangler here, or press Enter to keep the gate"
  if ($manual -match '^[A-Za-z0-9_-]{12,}$') { $namespaceId = $manual }
}
if (-not $namespaceId) {
  $report = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    worker_dir = $WorkerDir
    kv_namespace_created = $false
    wrangler_toml_updated = $false
    namespace_id_recorded = $false
    namespace_id_printed = $false
    exact_gate = "stripe_worker_kv_namespace_missing"
  }
  $report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-kv-status.redacted.json"
  throw "KV namespace id was not detected. wrangler.toml was not changed."
}
$tomlPath = ".\wrangler.toml"
$toml = Get-Content $tomlPath -Raw
$block = "[[kv_namespaces]]`nbinding = `"ATLAS_PAYMENTS`"`nid = `"$namespaceId`"`n"
if ($toml -match '(?ms)^\s*\[\[kv_namespaces\]\]\s*.*?binding\s*=\s*"ATLAS_PAYMENTS".*?(?=^\s*\[|\z)') {
  $toml = [regex]::Replace($toml, '(?ms)^\s*\[\[kv_namespaces\]\]\s*.*?binding\s*=\s*"ATLAS_PAYMENTS".*?(?=^\s*\[|\z)', $block)
} elseif ($toml -match '(?ms)^#\s*\[\[kv_namespaces\]\]\s*\n#\s*binding\s*=\s*"ATLAS_PAYMENTS"\s*\n#\s*id\s*=\s*"<cloudflare-kv-namespace-id>"') {
  $toml = [regex]::Replace($toml, '(?ms)^#\s*\[\[kv_namespaces\]\]\s*\n#\s*binding\s*=\s*"ATLAS_PAYMENTS"\s*\n#\s*id\s*=\s*"<cloudflare-kv-namespace-id>"', $block.TrimEnd())
} else {
  $toml = $toml.TrimEnd() + "`n`n" + $block
}
Set-Content $tomlPath -Value $toml -Encoding utf8
$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  worker_dir = $WorkerDir
  kv_namespace_created_or_bound = $true
  wrangler_toml_updated = $true
  namespace_id_recorded = $true
  namespace_id_printed = $false
  exact_gate = $null
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-kv-status.redacted.json"
Write-Host "KV binding updated in wrangler.toml. Namespace id was recorded in config, not printed in this report."

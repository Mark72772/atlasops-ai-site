param()
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
Write-Host "Deploying atlasops-stripe-gateway. Secret values are not printed."
npx wrangler whoami | Out-Null
$deploy = npx wrangler deploy 2>&1
$deploy | Tee-Object -FilePath ".\stripe-worker-deploy-output.redacted.txt"
$workerUrl = $null
foreach ($line in $deploy) {
  if ($line -match 'https://[^ ]+\.workers\.dev') { $workerUrl = $Matches[0] }
}
$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  worker_url_captured = [bool]$workerUrl
  worker_url = $workerUrl
  secret_values_printed = $false
  exact_gate = $(if ($workerUrl) { $null } else { "stripe_worker_url_missing" })
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-deploy-status.redacted.json"
if (-not $workerUrl) { throw "Worker URL was not detected in deploy output." }
Write-Host "Worker deployed. URL captured in redacted deploy report."

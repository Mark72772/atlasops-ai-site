param([string]$WorkerUrl = "")
$ErrorActionPreference = "Stop"
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir
if (-not $WorkerUrl) { $WorkerUrl = Read-Host "Worker URL" }
$WorkerUrl = $WorkerUrl.TrimEnd("/")
$adminSecret = Read-Host "Optional admin/relay secret for admin positive test, or press Enter to skip" -AsSecureString
$health = Invoke-WebRequest -UseBasicParsing -Uri "$WorkerUrl/health" -Method GET
$config = Invoke-WebRequest -UseBasicParsing -Uri "$WorkerUrl/stripe/config" -Method GET
$adminDeniedStatus = $null
try { Invoke-WebRequest -UseBasicParsing -Uri "$WorkerUrl/admin/payments" -Method GET | Out-Null } catch { $adminDeniedStatus = $_.Exception.Response.StatusCode.value__ }
$unsignedStatus = $null
try { Invoke-WebRequest -UseBasicParsing -Uri "$WorkerUrl/stripe/webhook" -Method POST -Body "{}" -ContentType "application/json" | Out-Null } catch { $unsignedStatus = $_.Exception.Response.StatusCode.value__ }
$invalidStatus = $null
try { Invoke-WebRequest -UseBasicParsing -Uri "$WorkerUrl/stripe/create-checkout-session" -Method POST -Body '{"pack_id":"not-a-real-pack"}' -ContentType "application/json" | Out-Null } catch { $invalidStatus = $_.Exception.Response.StatusCode.value__ }
$adminPositive = "skipped"
if ($adminSecret.Length -gt 0) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecret)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $headers = @{ "X-Atlas-Relay-Secret" = $plain }
    $admin = Invoke-WebRequest -UseBasicParsing -Uri "$WorkerUrl/admin/payments" -Method GET -Headers $headers
    $adminPositive = $admin.StatusCode
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}
$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  worker_url = $WorkerUrl
  health_ok = ($health.StatusCode -eq 200)
  public_config_ok = ($config.StatusCode -eq 200)
  publishable_key_only = ($config.Content -notmatch "sk_(live|test)_" -and $config.Content -notmatch "whsec_")
  admin_without_secret_rejected = ($adminDeniedStatus -in 401,403)
  unsigned_webhook_rejected = ($unsignedStatus -ge 400)
  invalid_pack_rejected = ($invalidStatus -ge 400)
  admin_positive_status = $adminPositive
  secret_values_printed = $false
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-worker-test-status.redacted.json"
Write-Host "Worker tests complete. Secret values were not printed."

param(
  [ValidateSet("test","live")]
  [string]$Mode = "test",
  [string]$WorkerUrl = "https://atlasops-stripe-gateway.atlasops-ai.workers.dev"
)
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir

function ConvertFrom-SecureStringInMemory([SecureString]$Secret) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function New-RelaySecret {
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).Replace("+","-").Replace("/","_").TrimEnd("=")
}

function Install-WorkerSecret([string]$Name, [SecureString]$Secret) {
  $plain = ConvertFrom-SecureStringInMemory $Secret
  try {
    $plain | cmd /c "npx wrangler secret put $Name 2>&1" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Wrangler failed to install $Name" }
  } finally {
    $plain = $null
    [GC]::Collect()
  }
}

function Assert-KvBinding {
  $config = cmd /c "npx wrangler deploy --dry-run --outdir .wrangler-stage-a-check 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "Wrangler dry-run failed while verifying ATLAS_PAYMENTS binding." }
  $text = ($config -join "`n")
  if ($text -notmatch "ATLAS_PAYMENTS") { throw "ATLAS_PAYMENTS KV binding missing from Worker configuration." }
  if (Test-Path -LiteralPath ".wrangler-stage-a-check") {
    Remove-Item -LiteralPath ".wrangler-stage-a-check" -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$whoami = cmd /c "npx wrangler whoami 2>&1"
if ($LASTEXITCODE -ne 0) { throw "Wrangler auth missing. Run npx wrangler login first." }
Assert-KvBinding
if ($Mode -eq "live") {
  $confirm = Read-Host "Type ROTATED if the exposed live Stripe key was revoked/rotated and the replacement is being pasted only here"
  if ($confirm -ne "ROTATED") { throw "stripe_key_rotation_required" }
}

Write-Host "Paste Stripe secret key only into this secure prompt. Do not paste it into chat, Codex, reports, or files."
$stripeSecret = Read-Host "STRIPE_SECRET_KEY" -AsSecureString
Install-WorkerSecret "STRIPE_SECRET_KEY" $stripeSecret
$stripeSecret = $null

$existingRelay = [Environment]::GetEnvironmentVariable("ATLAS_STRIPE_WORKER_ADMIN_SECRET", "User")
if ([string]::IsNullOrWhiteSpace($existingRelay)) { $existingRelay = New-RelaySecret }
$relaySecure = ConvertTo-SecureString $existingRelay -AsPlainText -Force
Install-WorkerSecret "ATLAS_RELAY_SECRET" $relaySecure
$relaySecure = $null
[Environment]::SetEnvironmentVariable("ATLAS_STRIPE_WORKER_URL", $WorkerUrl, "User")
[Environment]::SetEnvironmentVariable("ATLAS_STRIPE_WORKER_ADMIN_SECRET", $existingRelay, "User")
[Environment]::SetEnvironmentVariable("ATLAS_STRIPE_MODE", $Mode, "User")

$report = [ordered]@{
  ok = $true
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  mode = $Mode
  worker_url = $WorkerUrl
  kv_binding_verified = $true
  stripe_secret_key_configured = $true
  atlas_relay_secret_configured = $true
  local_admin_secret_configured = $true
  secret_values_printed = $false
  secret_values_written_to_disk = $false
  exact_gate = $null
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-stage-a-secret-install.redacted.json"
$report | ConvertTo-Json

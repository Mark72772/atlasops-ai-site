param()
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$WorkerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $WorkerDir

function ConvertFrom-SecureStringInMemory([SecureString]$Secret) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
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

Write-Host "Paste Stripe webhook signing secret only into this secure prompt. Do not paste it into chat, Codex, reports, or files."
$webhookSecret = Read-Host "STRIPE_WEBHOOK_SECRET" -AsSecureString
Install-WorkerSecret "STRIPE_WEBHOOK_SECRET" $webhookSecret
$report = [ordered]@{
  ok = $true
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  webhook_secret_installed = $true
  webhook_secret_printed = $false
  webhook_secret_written_to_disk = $false
  exact_gate = $null
}
$report | ConvertTo-Json | Out-File -Encoding utf8 ".\stripe-stage-b-webhook-secret-install.redacted.json"
$report | ConvertTo-Json

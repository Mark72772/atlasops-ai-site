param(
  [ValidateSet("test","live")]
  [string]$Mode = "test",
  [string]$WorkerUrl = "https://atlasops-stripe-gateway.atlasops-ai.workers.dev"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$WorkerDir = "G:\Open Atlas AI\ATLAS-PUBLIC-WEBSITE\cloudflare\stripe-gateway"
$ExpectedWorkerName = "atlasops-stripe-gateway"
$ReportPath = Join-Path $WorkerDir "stripe-stage-a-secret-install.redacted.json"
$SecretValueMarkerPattern = "(sk|rk)_(live|test)_|wh" + "sec_"

Set-Location -LiteralPath $WorkerDir

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

function Invoke-WranglerRedacted([string]$Command) {
  $output = cmd /c $Command 2>&1
  $exitCode = $LASTEXITCODE
  return [pscustomobject]@{
    command = $Command
    exit_code = $exitCode
    output_redacted = @($output | ForEach-Object { [string]$_ })
  }
}

function Get-SecretNamesFromOutput([string[]]$Lines) {
  $names = New-Object System.Collections.Generic.List[string]
  $text = ($Lines -join "`n")

  try {
    $jsonStart = $text.IndexOf("[")
    $jsonEnd = $text.LastIndexOf("]")
    if ($jsonStart -ge 0 -and $jsonEnd -ge $jsonStart) {
      $jsonText = $text.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
      $parsed = $jsonText | ConvertFrom-Json
      foreach ($item in @($parsed)) {
        if ($item -is [string]) {
          if (-not $names.Contains($item)) { $names.Add($item) | Out-Null }
        } elseif ($null -ne $item.name) {
          $name = [string]$item.name
          if (-not $names.Contains($name)) { $names.Add($name) | Out-Null }
        }
      }
    }
  } catch {
    # Wrangler versions differ in how secret list output is framed. Regex below is the fallback.
  }

  foreach ($line in $Lines) {
    foreach ($match in [regex]::Matches($line, "\b(STRIPE_SECRET_KEY|ATLAS_RELAY_SECRET|STRIPE_WEBHOOK_SECRET)\b")) {
      if (-not $names.Contains($match.Value)) { $names.Add($match.Value) | Out-Null }
    }
  }

  return @($names | Sort-Object -Unique)
}

function Get-WorkerSecretList {
  $result = Invoke-WranglerRedacted "npx wrangler secret list"
  $names = Get-SecretNamesFromOutput $result.output_redacted
  return [pscustomobject]@{
    exit_code = $result.exit_code
    names = @($names)
    output_redacted = $result.output_redacted
  }
}

function Write-StageAReport([hashtable]$Data) {
  $Data.generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
  $Data.worker_dir = $WorkerDir
  $Data.worker_url = $WorkerUrl
  $Data.mode = $Mode
  $Data.secret_values_printed = $false
  $Data.secret_values_written_to_disk = $false
  $Data | ConvertTo-Json -Depth 10 | Out-File -LiteralPath $ReportPath -Encoding utf8
}

function Assert-TargetWorker {
  if (-not (Test-Path -LiteralPath (Join-Path $WorkerDir "wrangler.toml"))) {
    throw "wrangler_toml_missing"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $WorkerDir "worker.js"))) {
    throw "worker_js_missing"
  }

  $toml = Get-Content -LiteralPath (Join-Path $WorkerDir "wrangler.toml") -Raw
  if ($toml -notmatch "name\s*=\s*`"$ExpectedWorkerName`"") { throw "wrong_worker_name" }
  if ($toml -notmatch "binding\s*=\s*`"ATLAS_PAYMENTS`"") { throw "atlas_payments_kv_binding_missing" }
  if ($toml -match $SecretValueMarkerPattern) { throw "secret_value_in_wrangler_toml" }
  if ($Mode -eq "test" -and $toml -notmatch "STRIPE_MODE\s*=\s*`"test`"") { throw "worker_mode_not_test" }

  if ($Mode -eq "live") {
    if ($toml -notmatch "STRIPE_LIVE_CHECKOUT_APPROVED\s*=\s*`"true`"") {
      throw "live_checkout_not_approved_in_wrangler_toml"
    }
  }

  $whoami = Invoke-WranglerRedacted "npx wrangler whoami"
  if ($whoami.exit_code -ne 0) {
    Write-StageAReport @{
      ok = $false
      exact_gate = "wrangler_auth_missing"
      wrangler_whoami = $whoami
    }
    throw "wrangler_auth_missing"
  }

  $dryRun = Invoke-WranglerRedacted "npx wrangler deploy --dry-run --outdir .wrangler-stage-a-check"
  if (Test-Path -LiteralPath ".wrangler-stage-a-check") {
    Remove-Item -LiteralPath ".wrangler-stage-a-check" -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($dryRun.exit_code -ne 0) {
    Write-StageAReport @{
      ok = $false
      exact_gate = "wrangler_dry_run_failed"
      wrangler_whoami = $whoami
      wrangler_dry_run = $dryRun
    }
    throw "wrangler_dry_run_failed"
  }

  $dryRunText = ($dryRun.output_redacted -join "`n")
  if ($dryRunText -notmatch "ATLAS_PAYMENTS") { throw "atlas_payments_kv_binding_missing" }

  return [pscustomobject]@{
    whoami = $whoami
    dry_run = $dryRun
  }
}

function Assert-StripeKeyPrefix([string]$Plain, [string]$Mode) {
  $testSecretPrefixes = @(("sk" + "_test_"), ("rk" + "_test_"))
  $liveSecretPrefixes = @(("sk" + "_live_"), ("rk" + "_live_"))
  if ($Mode -eq "test" -and -not ($Plain.StartsWith($testSecretPrefixes[0]) -or $Plain.StartsWith($testSecretPrefixes[1]))) {
    throw "stripe_test_secret_key_required"
  }
  if ($Mode -eq "live" -and -not ($Plain.StartsWith($liveSecretPrefixes[0]) -or $Plain.StartsWith($liveSecretPrefixes[1]))) {
    throw "stripe_live_secret_key_required"
  }
}

function Install-WorkerSecret([string]$Name, [SecureString]$Secret) {
  $plain = ConvertFrom-SecureStringInMemory $Secret
  try {
    if ($Name -eq "STRIPE_SECRET_KEY") { Assert-StripeKeyPrefix $plain $Mode }
    $output = $plain | cmd /c "npx wrangler secret put $Name" 2>&1
    $exitCode = $LASTEXITCODE
    return [pscustomobject]@{
      name = $Name
      exit_code = $exitCode
      output_redacted = @($output | ForEach-Object { [string]$_ })
    }
  } finally {
    $plain = $null
    [GC]::Collect()
  }
}

try {
  $target = Assert-TargetWorker
  $before = Get-WorkerSecretList

  if ($Mode -eq "live") {
    $confirm = Read-Host "Type ROTATED if the exposed live Stripe key was revoked/rotated and the replacement is being pasted only here"
    if ($confirm -ne "ROTATED") { throw "stripe_key_rotation_required" }
  }

  Write-Host "Paste Stripe $Mode secret key only into this secure prompt. Do not paste it into chat, Codex, reports, or files."
  $stripeSecret = Read-Host "STRIPE_SECRET_KEY" -AsSecureString
  $stripeInstall = Install-WorkerSecret "STRIPE_SECRET_KEY" $stripeSecret
  $stripeSecret = $null
  if ($stripeInstall.exit_code -ne 0) { throw "wrangler_failed_to_install_stripe_secret_key" }

  $afterStripe = Get-WorkerSecretList
  if ($afterStripe.exit_code -ne 0 -or -not ($afterStripe.names -contains "STRIPE_SECRET_KEY")) {
    Write-StageAReport @{
      ok = $false
      exact_gate = "cloudflare_secret_list_missing_stripe_secret_key_after_install"
      secrets_before = $before
      stripe_install = $stripeInstall
      secrets_after_stripe = $afterStripe
    }
    throw "cloudflare_secret_list_missing_stripe_secret_key_after_install"
  }

  $existingRelay = [Environment]::GetEnvironmentVariable("ATLAS_STRIPE_WORKER_ADMIN_SECRET", "User")
  if ([string]::IsNullOrWhiteSpace($existingRelay)) { $existingRelay = New-RelaySecret }
  $relaySecure = ConvertTo-SecureString $existingRelay -AsPlainText -Force
  $relayInstall = Install-WorkerSecret "ATLAS_RELAY_SECRET" $relaySecure
  $relaySecure = $null
  if ($relayInstall.exit_code -ne 0) { throw "wrangler_failed_to_install_atlas_relay_secret" }

  $afterRelay = Get-WorkerSecretList
  $hasStripe = $afterRelay.names -contains "STRIPE_SECRET_KEY"
  $hasRelay = $afterRelay.names -contains "ATLAS_RELAY_SECRET"
  if ($afterRelay.exit_code -ne 0 -or -not ($hasStripe -and $hasRelay)) {
    Write-StageAReport @{
      ok = $false
      exact_gate = "cloudflare_secret_list_missing_stage_a_secret_after_install"
      secrets_before = $before
      stripe_install = $stripeInstall
      secrets_after_stripe = $afterStripe
      relay_install = $relayInstall
      secrets_after_relay = $afterRelay
    }
    throw "cloudflare_secret_list_missing_stage_a_secret_after_install"
  }

  [Environment]::SetEnvironmentVariable("ATLAS_STRIPE_WORKER_URL", $WorkerUrl, "User")
  [Environment]::SetEnvironmentVariable("ATLAS_STRIPE_WORKER_ADMIN_SECRET", $existingRelay, "User")
  [Environment]::SetEnvironmentVariable("ATLAS_STRIPE_MODE", $Mode, "User")

  $report = @{
    ok = $true
    exact_gate = $null
    target_worker_name = $ExpectedWorkerName
    target_verified = $true
    kv_binding_verified = $true
    wrangler_whoami_exit_code = $target.whoami.exit_code
    wrangler_dry_run_exit_code = $target.dry_run.exit_code
    secrets_before_names = @($before.names)
    secret_names_after_stripe = @($afterStripe.names)
    secret_names_after_relay = @($afterRelay.names)
    stripe_secret_key_configured = $true
    atlas_relay_secret_configured = $true
    local_admin_secret_configured = $true
  }
  Write-StageAReport $report
  $report | ConvertTo-Json -Depth 10
} catch {
  $message = $_.Exception.Message
  $existing = $null
  if (Test-Path -LiteralPath $ReportPath) {
    try { $existing = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json } catch {}
  }
  if ($null -eq $existing -or $existing.ok -ne $false) {
    Write-StageAReport @{
      ok = $false
      exact_gate = $message
      error_redacted = $message
    }
  }
  throw
}

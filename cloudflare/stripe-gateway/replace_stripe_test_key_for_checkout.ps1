param(
  [string]$WorkerUrl = "https://atlasops-stripe-gateway.atlasops-ai.workers.dev",
  [string]$ReportPath = "G:\Open Atlas AI\ATLAS\atlas-runtime\atlas_runtime\reports\sprint_88d_key_replacement_execution_report.json"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$WorkerDir = "G:\Open Atlas AI\ATLAS-PUBLIC-WEBSITE\cloudflare\stripe-gateway"
$RuntimeSecretDir = "G:\Open Atlas AI\ATLAS\runtime-data\payments\stripe"
$ChatExposedFingerprintPath = Join-Path $RuntimeSecretDir "chat-exposed-key-fingerprints.json"
$ExpectedWorkerName = "atlasops-stripe-gateway"
$TestSecretPrefix = "s" + "k" + "_test_"
$TestRestrictedPrefix = "r" + "k" + "_test_"
$LiveSecretPrefix = "s" + "k" + "_live_"
$LiveRestrictedPrefix = "r" + "k" + "_live_"

Set-Location -LiteralPath $WorkerDir
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReportPath) | Out-Null

$Steps = New-Object System.Collections.Generic.List[object]
$SecretNamesAfter = @()
$PrefixClassAccepted = $null
$ReplacementInstalled = $false

function Add-Step([string]$Name, [bool]$Ok, [string]$Gate = $null, [object]$Detail = $null) {
  $script:Steps.Add([ordered]@{
    name = $Name
    ok = $Ok
    exact_gate = $Gate
    detail = $Detail
    at_utc = (Get-Date).ToUniversalTime().ToString("o")
  }) | Out-Null
  if ($Ok) {
    Write-Host "[OK] $Name"
  } elseif ($Gate) {
    Write-Host "[GATED] $Name -> $Gate"
  } else {
    Write-Host "[FAILED] $Name"
  }
}

function Write-Report([bool]$Ok, [string]$Gate = $null) {
  $payload = [ordered]@{
    ok = $Ok
    report = "sprint_88d_key_replacement_execution_report"
    existing_worker_only = $true
    worker_url = $WorkerUrl
    worker_name = $ExpectedWorkerName
    replaced_secret_name = "STRIPE_SECRET_KEY"
    untouched_secret_names = @("ATLAS_RELAY_SECRET", "STRIPE_WEBHOOK_SECRET")
    replacement_test_key_accepted_through_terminal = $ReplacementInstalled
    accepted_prefix_class = $PrefixClassAccepted
    worker_secret_names_detected = $SecretNamesAfter
    exact_gate = $Gate
    secret_values_printed = $false
    secret_values_written_to_reports = $false
    steps = @($Steps)
    generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
  }
  $payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
}

function Invoke-Captured([string]$Command) {
  $output = cmd /c "$Command 2>&1"
  [pscustomobject]@{
    exit_code = $LASTEXITCODE
    output = @($output | ForEach-Object { [string]$_ })
  }
}

function Get-SecretNamesFromLines([string[]]$Lines) {
  $names = New-Object System.Collections.Generic.List[string]
  $text = ($Lines -join "`n")
  try {
    $start = $text.IndexOf("[")
    $end = $text.LastIndexOf("]")
    if ($start -ge 0 -and $end -ge $start) {
      $parsed = $text.Substring($start, $end - $start + 1) | ConvertFrom-Json
      foreach ($item in @($parsed)) {
        $name = if ($item -is [string]) { $item } else { [string]$item.name }
        if (-not [string]::IsNullOrWhiteSpace($name) -and -not $names.Contains($name)) {
          $names.Add($name) | Out-Null
        }
      }
    }
  } catch {}
  foreach ($line in $Lines) {
    foreach ($match in [regex]::Matches($line, "\b(STRIPE_SECRET_KEY|ATLAS_RELAY_SECRET|STRIPE_WEBHOOK_SECRET)\b")) {
      if (-not $names.Contains($match.Value)) { $names.Add($match.Value) | Out-Null }
    }
  }
  return @($names | Sort-Object -Unique)
}

function Get-WorkerSecretNames {
  $result = Invoke-Captured "npx --yes wrangler secret list"
  if ($result.exit_code -ne 0) {
    Add-Step "wrangler_secret_list" $false "wrangler_secret_list_failed" @{ exit_code = $result.exit_code }
    return @()
  }
  $names = Get-SecretNamesFromLines $result.output
  Add-Step "wrangler_secret_list" $true $null @{ names = $names }
  return $names
}

function Get-StripeKeyPrefixClass([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "unknown" }
  $candidate = $Value.Trim()
  if ($candidate.StartsWith($TestSecretPrefix)) { return "sk_test" }
  if ($candidate.StartsWith($TestRestrictedPrefix)) { return "rk_test" }
  if ($candidate.StartsWith($LiveSecretPrefix)) { return "sk_live" }
  if ($candidate.StartsWith($LiveRestrictedPrefix)) { return "rk_live" }
  return "unknown"
}

function Get-SecretFingerprint([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-RejectedFingerprints {
  $set = New-Object System.Collections.Generic.HashSet[string]
  if (-not (Test-Path -LiteralPath $ChatExposedFingerprintPath)) { return $set }
  try {
    $payload = Get-Content -LiteralPath $ChatExposedFingerprintPath -Raw | ConvertFrom-Json
    foreach ($record in @($payload.records)) {
      $fingerprint = [string]$record.fingerprint_sha256
      if ($record.status -like "rejected*" -and -not [string]::IsNullOrWhiteSpace($fingerprint)) {
        [void]$set.Add($fingerprint)
      }
    }
  } catch {
    Add-Step "read_chat_exposed_fingerprint_store" $false "chat_exposed_fingerprint_store_unreadable" @{ error = $_.Exception.Message }
  }
  return $set
}

function ConvertFrom-SecureStringInMemory([SecureString]$Secret) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Install-WorkerSecretFromMemory([string]$Name, [string]$PlainSecret) {
  try {
    $PlainSecret | cmd /c "npx --yes wrangler secret put $Name 2>&1" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "wrangler_secret_put_failed" }
    Add-Step "install_$Name" $true
  } finally {
    [GC]::Collect()
  }
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $WorkerDir "wrangler.toml"))) {
    throw "wrangler_toml_missing"
  }
  $toml = Get-Content -LiteralPath (Join-Path $WorkerDir "wrangler.toml") -Raw
  if ($toml -notmatch 'name\s*=\s*"atlasops-stripe-gateway"') { throw "wrong_worker_target" }
  Add-Step "verify_worker_target" $true

  $whoami = Invoke-Captured "npx --yes wrangler whoami"
  if ($whoami.exit_code -ne 0) { throw "wrangler_auth_failed" }
  Add-Step "verify_wrangler_auth" $true

  $existing = Get-WorkerSecretNames
  foreach ($required in @("STRIPE_SECRET_KEY", "ATLAS_RELAY_SECRET", "STRIPE_WEBHOOK_SECRET")) {
    if ($required -notin $existing) { throw "required_existing_secret_missing:$required" }
  }
  Add-Step "verify_existing_secret_names" $true $null @{ required = @("STRIPE_SECRET_KEY", "ATLAS_RELAY_SECRET", "STRIPE_WEBHOOK_SECRET") }

  Write-Host ""
  Write-Host "===================================================="
  Write-Host "ATLAS STRIPE CHECKOUT KEY REPLACEMENT"
  Write-Host "===================================================="
  Write-Host "The current test key appears insufficient for Checkout Session creation."
  Write-Host "Paste a fresh Stripe TEST secret key with Checkout Sessions create/write permission."
  Write-Host ("Preferred: " + $TestSecretPrefix + "...")
  Write-Host ("Allowed: " + $TestRestrictedPrefix + "... only if Checkout Sessions write is enabled.")
  Write-Host "Do NOT paste secrets into chat."
  Write-Host "Live keys are rejected."
  Write-Host "===================================================="

  $secure = Read-Host "Paste fresh Stripe TEST secret key here" -AsSecureString
  $plain = ConvertFrom-SecureStringInMemory $secure
  try {
    $plain = ($plain -as [string]).Trim()
    $prefix = Get-StripeKeyPrefixClass $plain
    if ([string]::IsNullOrWhiteSpace($plain)) { throw "stripe_test_secret_input_blank" }
    if ($prefix -eq "sk_live" -or $prefix -eq "rk_live") { throw "stripe_live_key_rejected_in_test_mode" }
    if ($prefix -ne "sk_test" -and $prefix -ne "rk_test") { throw "stripe_key_prefix_not_test_mode" }
    $denylist = Get-RejectedFingerprints
    $fingerprint = Get-SecretFingerprint $plain
    if ($denylist.Contains($fingerprint)) { throw "stripe_test_key_pasted_in_chat_rejected" }
    $PrefixClassAccepted = $prefix
    Add-Step "validate_replacement_test_key" $true $null @{ prefix_class = $prefix; denylist_count = $denylist.Count; value_displayed = $false }

    Install-WorkerSecretFromMemory "STRIPE_SECRET_KEY" $plain
    $ReplacementInstalled = $true
  } finally {
    $plain = $null
    $secure = $null
    [GC]::Collect()
  }

  $SecretNamesAfter = Get-WorkerSecretNames
  if ("STRIPE_SECRET_KEY" -notin $SecretNamesAfter) { throw "stripe_secret_key_name_missing_after_replacement" }
  if ("ATLAS_RELAY_SECRET" -notin $SecretNamesAfter) { throw "atlas_relay_secret_name_missing_after_replacement" }
  if ("STRIPE_WEBHOOK_SECRET" -notin $SecretNamesAfter) { throw "stripe_webhook_secret_name_missing_after_replacement" }
  Add-Step "confirm_secret_names_after_replacement" $true $null @{ names = $SecretNamesAfter }
  Write-Report $true $null
  Write-Host "Replacement complete. Secret values were not printed or written."
  exit 0
} catch {
  $gate = [string]$_.Exception.Message
  Add-Step "replace_stripe_test_key_for_checkout" $false $gate
  Write-Report $false $gate
  Write-Error $gate
  exit 1
}

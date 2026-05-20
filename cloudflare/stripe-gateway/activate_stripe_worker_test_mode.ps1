param(
  [string]$WorkerUrl = "https://atlasops-stripe-gateway.atlasops-ai.workers.dev"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$WorkerDir = "G:\Open Atlas AI\ATLAS-PUBLIC-WEBSITE\cloudflare\stripe-gateway"
$RuntimeDir = "G:\Open Atlas AI\ATLAS\atlas-runtime"
$Python = "G:\Open Atlas AI\.venvs\atlas-runtime-py314\Scripts\python.exe"
$ExpectedWorkerName = "atlasops-stripe-gateway"
$WebhookUrl = $WorkerUrl.TrimEnd("/") + "/stripe/webhook"
$RuntimeSecretDir = "G:\Open Atlas AI\ATLAS\runtime-data\payments\stripe"
$RelaySecretDpapiPath = Join-Path $RuntimeSecretDir "atlas-worker-relay-secret.dpapi"
$ExecutionReportPath = "G:\Open Atlas AI\ATLAS\atlas-runtime\atlas_runtime\reports\sprint_86_one_click_activation_execution_report.json"
$LocalReportPath = Join-Path $WorkerDir "stripe-one-click-activation.redacted.json"
$StripeApiVersion = "2026-02-25.clover"
$SecretMarkerPattern = "(sk|rk)_(live|test)_|wh" + "sec_"

Set-Location -LiteralPath $WorkerDir
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ExecutionReportPath) | Out-Null
New-Item -ItemType Directory -Force -Path $RuntimeSecretDir | Out-Null

$Progress = New-Object System.Collections.Generic.List[object]
$Errors = New-Object System.Collections.Generic.List[object]
$SecretNamesAfter = @()
$WebhookEndpointId = $null
$CheckoutSessionsCreated = 0
$SignedWebhookEventsVerified = 0
$VerifiedTestPayments = 0
$DownloadTokensCreated = 0
$DeliveryEmailsSent = 0
$ManualFallback = $null

$TestPrefixes = @("s" + "k" + "_test_", "r" + "k" + "_test_")
$LivePrefixes = @("s" + "k" + "_live_", "r" + "k" + "_live_")

function Add-Step([string]$Name, [bool]$Ok, [string]$Gate = $null, [object]$Detail = $null) {
  $script:Progress.Add([ordered]@{
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

function Redact-Text([string]$Text, [string[]]$Secrets) {
  if ($null -eq $Text) { return $null }
  $redacted = $Text
  foreach ($secret in $Secrets) {
    if (-not [string]::IsNullOrWhiteSpace($secret)) {
      $redacted = $redacted.Replace($secret, "[REDACTED]")
    }
  }
  return $redacted
}

function Invoke-Captured([string]$Command, [string[]]$Secrets = @()) {
  $output = cmd /c $Command 2>&1
  $exitCode = $LASTEXITCODE
  return [pscustomobject]@{
    command = $Command
    exit_code = $exitCode
    output_redacted = @($output | ForEach-Object { Redact-Text ([string]$_) $Secrets })
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
    # Wrangler output shape is version-specific; regex fallback handles table output.
  }

  foreach ($line in $Lines) {
    foreach ($match in [regex]::Matches($line, "\b(STRIPE_SECRET_KEY|ATLAS_RELAY_SECRET|STRIPE_WEBHOOK_SECRET)\b")) {
      if (-not $names.Contains($match.Value)) { $names.Add($match.Value) | Out-Null }
    }
  }

  return @($names | Sort-Object -Unique)
}

function Get-WorkerSecretList([string[]]$Secrets = @()) {
  $result = Invoke-Captured "npx wrangler secret list" $Secrets
  $names = Get-SecretNamesFromOutput $result.output_redacted
  return [pscustomobject]@{
    exit_code = $result.exit_code
    names = @($names)
    output_redacted = $result.output_redacted
  }
}

function ConvertFrom-SecureStringInMemory([SecureString]$Secret) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Read-TestStripeSecret {
  Write-Host ""
  Write-Host "Paste Stripe TEST secret key here. Do NOT paste it into chat."
  Write-Host "If you do not have one yet: Stripe Dashboard -> Developers -> API keys -> toggle Test mode -> reveal or create a test secret key."
  Write-Host ("Accepted prefixes: {0} or {1}. Live keys are rejected in test mode." -f $TestPrefixes[0], $TestPrefixes[1])

  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      $secure = Read-Host "Stripe TEST secret key" -AsSecureString
      if ($null -eq $secure -or $secure.Length -eq 0) {
        Write-Host "Blank input was rejected. Paste the test key into this terminal prompt."
        continue
      }
      $plain = ConvertFrom-SecureStringInMemory $secure
      if ([string]::IsNullOrWhiteSpace($plain)) {
        Write-Host "Blank input was rejected. Paste the test key into this terminal prompt."
        continue
      }
      if ($plain.StartsWith($LivePrefixes[0]) -or $plain.StartsWith($LivePrefixes[1])) {
        $plain = $null
        throw "stripe_live_key_rejected_in_test_mode"
      }
      if (-not ($plain.StartsWith($TestPrefixes[0]) -or $plain.StartsWith($TestPrefixes[1]))) {
        $plain = $null
        Write-Host "That key prefix is not accepted for test mode."
        continue
      }
      Write-Host "Test key prefix accepted. Secret value will not be printed or written."
      return $plain
    } catch {
      if ($_.Exception.Message -eq "stripe_live_key_rejected_in_test_mode") { throw }
      Write-Host "Secure prompt failed. Trying Windows credential prompt fallback."
      $credential = Get-Credential -UserName "stripe-test-key" -Message "Paste the Stripe TEST secret key into the password field only."
      if ($credential -and $credential.Password -and $credential.Password.Length -gt 0) {
        $plain = ConvertFrom-SecureStringInMemory $credential.Password
        if ($plain.StartsWith($TestPrefixes[0]) -or $plain.StartsWith($TestPrefixes[1])) { return $plain }
        if ($plain.StartsWith($LivePrefixes[0]) -or $plain.StartsWith($LivePrefixes[1])) {
          $plain = $null
          throw "stripe_live_key_rejected_in_test_mode"
        }
      }
    }
  }
  throw "stripe_test_secret_input_cancelled_or_blank"
}

function New-RelaySecret {
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).Replace("+","-").Replace("/","_").TrimEnd("=")
}

function Install-WorkerSecretPlain([string]$Name, [string]$PlainSecret, [string[]]$AllSecrets) {
  if ([string]::IsNullOrWhiteSpace($PlainSecret)) { throw "blank_secret_for_$Name" }
  $output = $PlainSecret | cmd /c "npx wrangler secret put $Name" 2>&1
  $exitCode = $LASTEXITCODE
  $redacted = @($output | ForEach-Object { Redact-Text ([string]$_) $AllSecrets })
  return [pscustomobject]@{
    name = $Name
    exit_code = $exitCode
    output_redacted = $redacted
  }
}

function Assert-WorkerTarget {
  if (-not (Test-Path -LiteralPath (Join-Path $WorkerDir "wrangler.toml"))) { throw "wrangler_toml_missing" }
  if (-not (Test-Path -LiteralPath (Join-Path $WorkerDir "worker.js"))) { throw "worker_js_missing" }
  $toml = Get-Content -LiteralPath (Join-Path $WorkerDir "wrangler.toml") -Raw
  if ($toml -notmatch "name\s*=\s*`"$ExpectedWorkerName`"") { throw "wrong_worker_name" }
  if ($toml -notmatch "binding\s*=\s*`"ATLAS_PAYMENTS`"") { throw "atlas_payments_kv_binding_missing" }
  if ($toml -notmatch "STRIPE_MODE\s*=\s*`"test`"") { throw "worker_mode_not_test" }
  if ($toml -notmatch "STRIPE_LIVE_CHECKOUT_APPROVED\s*=\s*`"false`"") { throw "live_checkout_approval_not_false_for_test_mode" }
  if ($toml -match $SecretMarkerPattern) { throw "secret_value_in_wrangler_toml" }
}

function Invoke-ScriptStep([string]$Name, [string]$Command, [string]$WorkingDirectory, [string[]]$Secrets = @()) {
  $old = (Get-Location).Path
  try {
    Set-Location -LiteralPath $WorkingDirectory
    $output = cmd /c $Command 2>&1
    $exitCode = $LASTEXITCODE
    $redacted = @($output | ForEach-Object { Redact-Text ([string]$_) $Secrets })
    Add-Step $Name ($exitCode -eq 0) $(if ($exitCode -eq 0) { $null } else { "$Name`_failed" }) @{ exit_code = $exitCode; output_tail = @($redacted | Select-Object -Last 80) }
    return [pscustomobject]@{ exit_code = $exitCode; output_redacted = $redacted }
  } finally {
    Set-Location -LiteralPath $old
  }
}

function Create-StripeWebhookEndpoint([string]$StripeSecret) {
  $events = @("checkout.session.completed","payment_intent.succeeded","payment_intent.payment_failed","charge.refunded")
  $pairs = New-Object System.Collections.Generic.List[string]
  $pairs.Add("url=$([uri]::EscapeDataString($WebhookUrl))") | Out-Null
  foreach ($event in $events) { $pairs.Add("enabled_events[]=$([uri]::EscapeDataString($event))") | Out-Null }
  $body = $pairs -join "&"
  $headers = @{ Authorization = "Bearer $StripeSecret"; "Stripe-Version" = $StripeApiVersion }
  return Invoke-RestMethod -Method Post -Uri "https://api.stripe.com/v1/webhook_endpoints" -Headers $headers -Body $body -ContentType "application/x-www-form-urlencoded"
}

function Write-ActivationReport([string]$Gate = $null, [bool]$Ok = $false) {
  $report = [ordered]@{
    ok = $Ok
    generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    worker_dir = $WorkerDir
    worker_url = $WorkerUrl
    webhook_url = $WebhookUrl
    mode = "test"
    progress = @($Progress)
    errors = @($Errors)
    worker_secret_names_detected = @($SecretNamesAfter)
    webhook_endpoint_id = $WebhookEndpointId
    checkout_sessions_created = $CheckoutSessionsCreated
    signed_webhook_events_verified = $SignedWebhookEventsVerified
    verified_test_payments = $VerifiedTestPayments
    download_tokens_created = $DownloadTokensCreated
    delivery_emails_sent = $DeliveryEmailsSent
    live_sales = 0
    live_revenue = 0
    manual_fallback = $ManualFallback
    secret_values_printed = $false
    secret_values_written_to_git = $false
    secret_values_written_to_reports = $false
    exact_gate = $Gate
  }
  $report | ConvertTo-Json -Depth 18 | Set-Content -LiteralPath $ExecutionReportPath -Encoding UTF8
  $report | ConvertTo-Json -Depth 18 | Set-Content -LiteralPath $LocalReportPath -Encoding UTF8
}

$stripeSecretPlain = $null
$relaySecretPlain = $null
$webhookSecretPlain = $null

try {
  Write-Host "Atlas Stripe Worker one-click activation: existing Worker, test mode only."
  Write-Host "No Stripe secret, webhook secret, or relay secret value will be printed."

  Assert-WorkerTarget
  Add-Step "verify_worker_target" $true $null @{ worker_name = $ExpectedWorkerName; worker_url = $WorkerUrl; mode = "test"; live_checkout_approved = $false }

  $whoami = Invoke-Captured "npx wrangler whoami"
  if ($whoami.exit_code -ne 0) { throw "wrangler_auth_missing" }
  Add-Step "verify_wrangler_auth" $true $null @{ exit_code = $whoami.exit_code; output_tail = @($whoami.output_redacted | Select-Object -Last 20) }

  $beforeSecrets = Get-WorkerSecretList
  Add-Step "read_initial_worker_secret_names" ($beforeSecrets.exit_code -eq 0) $null @{ names = @($beforeSecrets.names) }

  $stripeSecretPlain = Read-TestStripeSecret
  Add-Step "read_single_test_key_prompt" $true $null @{ test_key_prefix_valid = $true }

  $relaySecretPlain = New-RelaySecret
  $allKnownSecrets = @($stripeSecretPlain, $relaySecretPlain)

  $stripeInstall = Install-WorkerSecretPlain "STRIPE_SECRET_KEY" $stripeSecretPlain $allKnownSecrets
  if ($stripeInstall.exit_code -ne 0) { throw "wrangler_secret_put_stripe_secret_key_failed" }
  $afterStripe = Get-WorkerSecretList $allKnownSecrets
  if (-not ($afterStripe.names -contains "STRIPE_SECRET_KEY")) { throw "cloudflare_secret_list_missing_stripe_secret_key_after_install" }
  Add-Step "install_stripe_secret_key" $true $null @{ secret_name_detected = $true; output_tail = @($stripeInstall.output_redacted | Select-Object -Last 20) }

  $relayInstall = Install-WorkerSecretPlain "ATLAS_RELAY_SECRET" $relaySecretPlain $allKnownSecrets
  if ($relayInstall.exit_code -ne 0) { throw "wrangler_secret_put_atlas_relay_secret_failed" }
  $afterRelay = Get-WorkerSecretList $allKnownSecrets
  if (-not ($afterRelay.names -contains "ATLAS_RELAY_SECRET")) { throw "cloudflare_secret_list_missing_atlas_relay_secret_after_install" }
  Add-Step "install_atlas_relay_secret" $true $null @{ secret_name_detected = $true; output_tail = @($relayInstall.output_redacted | Select-Object -Last 20) }

  $relayEncrypted = ConvertTo-SecureString $relaySecretPlain -AsPlainText -Force | ConvertFrom-SecureString
  $relayEncrypted | Set-Content -LiteralPath $RelaySecretDpapiPath -Encoding UTF8
  [Environment]::SetEnvironmentVariable("ATLAS_STRIPE_WORKER_URL", $WorkerUrl, "User")
  [Environment]::SetEnvironmentVariable("ATLAS_STRIPE_WORKER_ADMIN_SECRET", $relaySecretPlain, "User")
  [Environment]::SetEnvironmentVariable("ATLAS_STRIPE_MODE", "test", "User")
  [Environment]::SetEnvironmentVariable("ATLAS_STRIPE_WORKER_RELAY_SECRET_DPAPI_PATH", $RelaySecretDpapiPath, "User")
  $env:ATLAS_STRIPE_WORKER_URL = $WorkerUrl
  $env:ATLAS_STRIPE_WORKER_ADMIN_SECRET = $relaySecretPlain
  $env:ATLAS_STRIPE_MODE = "test"
  Add-Step "store_relay_secret_locally_dpapi_and_set_env" $true $null @{ dpapi_file = $RelaySecretDpapiPath; user_env_set = $true }

  $deployA = Invoke-ScriptStep "deploy_worker_stage_a" ".\deploy_stripe_worker.ps1" $WorkerDir $allKnownSecrets
  if ($deployA.exit_code -ne 0) { throw "deploy_worker_stage_a_failed" }
  $testA = Invoke-ScriptStep "verify_worker_stage_a" ".\test_stripe_worker.ps1" $WorkerDir $allKnownSecrets
  if ($testA.exit_code -ne 0) { throw "test_worker_stage_a_failed" }

  try {
    $endpoint = Create-StripeWebhookEndpoint $stripeSecretPlain
    if (-not $endpoint.id) { throw "stripe_webhook_endpoint_id_missing" }
    if (-not $endpoint.secret) { throw "stripe_webhook_signing_secret_missing" }
    $WebhookEndpointId = $endpoint.id
    $webhookSecretPlain = [string]$endpoint.secret
    $allKnownSecrets = @($stripeSecretPlain, $relaySecretPlain, $webhookSecretPlain)
    Add-Step "create_stripe_webhook_endpoint" $true $null @{ endpoint_id = $WebhookEndpointId; events = @("checkout.session.completed","payment_intent.succeeded","payment_intent.payment_failed","charge.refunded") }
  } catch {
    $ManualFallback = @(
      "Stripe Dashboard -> Developers -> Webhooks -> Add endpoint",
      "URL: $WebhookUrl",
      "Events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed, charge.refunded",
      "Then run install_stage_b_webhook_secret.ps1 and paste the signing secret only into the secure Wrangler prompt."
    )
    Add-Step "create_stripe_webhook_endpoint" $false "stripe_webhook_endpoint_api_create_failed_or_dashboard_required" @{ error_redacted = $_.Exception.Message; manual_fallback = $ManualFallback }
    throw "stripe_webhook_endpoint_api_create_failed_or_dashboard_required"
  }

  $webhookInstall = Install-WorkerSecretPlain "STRIPE_WEBHOOK_SECRET" $webhookSecretPlain $allKnownSecrets
  if ($webhookInstall.exit_code -ne 0) { throw "wrangler_secret_put_stripe_webhook_secret_failed" }
  $webhookSecretPlain = $null
  $afterWebhook = Get-WorkerSecretList $allKnownSecrets
  if (-not ($afterWebhook.names -contains "STRIPE_WEBHOOK_SECRET")) { throw "cloudflare_secret_list_missing_stripe_webhook_secret_after_install" }
  $SecretNamesAfter = @($afterWebhook.names)
  Add-Step "install_stripe_webhook_secret" $true $null @{ secret_name_detected = $true; names = @($SecretNamesAfter) }

  $deployB = Invoke-ScriptStep "deploy_worker_stage_b" ".\deploy_stripe_worker.ps1" $WorkerDir $allKnownSecrets
  if ($deployB.exit_code -ne 0) { throw "deploy_worker_stage_b_failed" }
  $testB = Invoke-ScriptStep "verify_full_worker" ".\test_stripe_worker.ps1" $WorkerDir $allKnownSecrets
  if ($testB.exit_code -ne 0) { throw "test_full_worker_failed" }

  $activation = Invoke-ScriptStep "run_local_atlas_activation_check" ".\run_stripe_activation_check.ps1" (Join-Path $RuntimeDir "scripts") $allKnownSecrets
  if ($activation.exit_code -ne 0) { throw "local_atlas_activation_check_failed" }

  $checkout = Invoke-ScriptStep "create_first_test_checkout" ".\test_stripe_checkout.ps1" $WorkerDir $allKnownSecrets
  $checkoutReportPath = Join-Path $WorkerDir "stripe-worker-test-checkout.redacted.json"
  if (Test-Path -LiteralPath $checkoutReportPath) {
    $checkoutReport = Get-Content -LiteralPath $checkoutReportPath -Raw | ConvertFrom-Json
    if ($checkoutReport.checkout_session_created -eq $true) { $CheckoutSessionsCreated = 1 }
  }
  if ($checkout.exit_code -ne 0 -or $CheckoutSessionsCreated -lt 1) { throw "stripe_worker_not_ready_for_test_checkout" }

  $checkoutProof = Invoke-ScriptStep "run_atlas_checkout_proof" "`"$Python`" -m atlas.guardrail_store.guardrail_checkout_tester --run" $RuntimeDir $allKnownSecrets
  if ($checkoutProof.exit_code -ne 0) { throw "atlas_checkout_proof_failed" }

  $deliveryLock = Invoke-ScriptStep "verify_guardrail_delivery_lock" "`"$Python`" -m atlas.guardrail_store.guardrail_delivery_lock --verify" $RuntimeDir $allKnownSecrets
  $downloadLock = Invoke-ScriptStep "verify_guardrail_download_token_lock" "`"$Python`" -m atlas.guardrail_store.guardrail_download_token --test-lock" $RuntimeDir $allKnownSecrets
  $emailLock = Invoke-ScriptStep "verify_guardrail_email_delivery_lock" "`"$Python`" -m atlas.guardrail_store.guardrail_email_delivery --test-lock" $RuntimeDir $allKnownSecrets
  if ($deliveryLock.exit_code -ne 0 -or $downloadLock.exit_code -ne 0 -or $emailLock.exit_code -ne 0) { throw "delivery_lock_proof_failed" }

  Write-ActivationReport $null $true
  Write-Host "One-click Stripe activation completed. Checkout URL is not payment proof; delivery remains locked until signed Stripe evidence."
} catch {
  $gate = $_.Exception.Message
  $Errors.Add([ordered]@{ exact_gate = $gate; at_utc = (Get-Date).ToUniversalTime().ToString("o") }) | Out-Null
  if ($gate -eq "stripe_test_secret_input_cancelled_or_blank") {
    $ManualFallback = @(
      "Run from Worker directory: npx wrangler secret put STRIPE_SECRET_KEY",
      "Then rerun this script so it can create the webhook endpoint and local Atlas env."
    )
  }
  Write-ActivationReport $gate $false
  Write-Host "One-click activation exact-gated: $gate"
  throw
} finally {
  $stripeSecretPlain = $null
  $relaySecretPlain = $null
  $webhookSecretPlain = $null
  [GC]::Collect()
}

const WORKER_VERSION = "sprint-78b-stripe-gateway-v1";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const memoryRateLimit = new Map();
const memoryEvents = new Map();

const SERVICE_CATALOG = {
  "agent-context-intelligence-guardrail": {
    name: "Agent Context Intelligence Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "codex-repo-control-guardrail": {
    name: "Codex Repo Control Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "claude-code-workflow-guardrail": {
    name: "Claude Code Workflow Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "rag-source-packet-guardrail": {
    name: "RAG Source Packet Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "ai-seo-visibility-guardrail": {
    name: "AI SEO Visibility Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "saas-operator-guardrail": {
    name: "SaaS Operator Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "stock-research-guardrail": {
    name: "Stock Research Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "social-publishing-guardrail": {
    name: "Social Publishing Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "git-deploy-safety-guardrail": {
    name: "Git Deploy Safety Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "stripe-payment-proof-guardrail": {
    name: "Stripe Payment Proof Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "openclaw-integration-guardrail": {
    name: "OpenClaw Integration Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "agent-daily-operations-guardrail": {
    name: "Agent Daily Operations Guardrail",
    amount: 9900,
    currency: "usd"
  },
  "agent-builder-starter-bundle": {
    name: "Agent Builder Starter Bundle",
    amount: 24900,
    currency: "usd",
    type: "downloadable_guardrail_bundle"
  },
  "social-publisher-safety-bundle": {
    name: "Social Publisher Safety Bundle",
    amount: 24900,
    currency: "usd",
    type: "downloadable_guardrail_bundle"
  },
  "revenue-agent-bundle": {
    name: "Revenue Agent Bundle",
    amount: 29900,
    currency: "usd",
    type: "downloadable_guardrail_bundle"
  },
  "openclaw-codex-integration-bundle": {
    name: "OpenClaw + Codex Integration Bundle",
    amount: 29900,
    currency: "usd",
    type: "downloadable_guardrail_bundle"
  },
  "agent-company-launch-kit": {
    name: "Agent Company Launch Kit",
    amount: 49900,
    currency: "usd",
    type: "downloadable_guardrail_bundle"
  },
  "agent-skill-update-club": {
    name: "Agent Skill Update Club",
    amount: 4900,
    currency: "usd",
    type: "subscription",
    revenue_type: "subscription",
    subscription_plan_id: "agent-skill-update-club",
    price_env: "STRIPE_PRICE_AGENT_SKILL_UPDATE_CLUB"
  },
  "agent-operations-monitor": {
    name: "Agent Operations Monitor",
    amount: 19900,
    currency: "usd",
    type: "subscription",
    revenue_type: "subscription",
    subscription_plan_id: "agent-operations-monitor",
    price_env: "STRIPE_PRICE_AGENT_OPERATIONS_MONITOR"
  },
  "social-sales-loop": {
    name: "Social Sales Loop",
    amount: 29900,
    currency: "usd",
    type: "subscription",
    revenue_type: "subscription",
    subscription_plan_id: "social-sales-loop",
    price_env: "STRIPE_PRICE_SOCIAL_SALES_LOOP"
  },
  "revenue-agent-reliability-system": {
    name: "Revenue Agent Reliability System",
    amount: 49900,
    currency: "usd",
    type: "subscription",
    revenue_type: "subscription",
    subscription_plan_id: "revenue-agent-reliability-system",
    price_env: "STRIPE_PRICE_REVENUE_AGENT_RELIABILITY_SYSTEM"
  },
  "custom-agent-ops-retainer": {
    name: "Custom Agent Ops Retainer",
    amount: 99900,
    currency: "usd",
    type: "custom_workflow_inquiry",
    revenue_type: "quote_subscription",
    subscription_plan_id: "custom-agent-ops-retainer"
  },
  "ai-business-assessment": {
    name: "AI Business Assessment",
    amount: 100000,
    currency: "usd",
    type: "service",
    revenue_type: "one_time",
    delivery_policy: "assessment_after_signed_payment_evidence"
  },
  "first-response-agent": {
    name: "First Response Agent Setup Review",
    amount: 49900,
    currency: "usd",
    type: "service",
    revenue_type: "one_time",
    delivery_policy: "implementation_scoping_after_signed_payment_evidence"
  },
  "first-response-agent-skill-pack": {
    name: "First Response Agent DIY Skill Pack",
    amount: 9900,
    currency: "usd",
    type: "downloadable_skill_pack",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "workflow-automation-upsell-pack": {
    name: "AI Workflow Automation Upsell Pack",
    amount: 150000,
    currency: "usd",
    type: "service_pack",
    revenue_type: "one_time",
    delivery_policy: "implementation_after_signed_payment_evidence"
  },
  "knowledge-system-agent-pack": {
    name: "Knowledge System / Custom GPT Pack",
    amount: 9900,
    currency: "usd",
    type: "downloadable_skill_pack",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "api-wrapper-product-factory-pack": {
    name: "API Wrapper / Unbundling Product Factory Pack",
    amount: 24900,
    currency: "usd",
    type: "agent_builder_pack",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "marketplace-radar-pack": {
    name: "Marketplace Radar Pack",
    amount: 9900,
    currency: "usd",
    type: "source_gated_pack",
    revenue_type: "one_time",
    delivery_policy: "framework_delivery_after_signed_payment_evidence"
  },
  "social-media-distribution-pack": {
    name: "LinkedIn/X/Media Distribution Pack",
    amount: 9900,
    currency: "usd",
    type: "social_agent_addon",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "recurring-revenue-monitor-pack": {
    name: "Recurring Revenue Monitor Pack",
    amount: 9900,
    currency: "usd",
    type: "revenue_agent_addon",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "claude-code-team-ergonomics-pack": {
    name: "Claude Code Team Ergonomics Agent Pack",
    amount: 9900,
    currency: "usd",
    type: "downloadable_skill_pack",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "claude-code-team-ergonomics-builder-pack": {
    name: "Claude Code Team Ergonomics Builder Pack",
    amount: 24900,
    currency: "usd",
    type: "downloadable_skill_pack",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "claude-code-team-ergonomics-setup-review": {
    name: "Claude Code Team Ergonomics Setup Review",
    amount: 49900,
    currency: "usd",
    type: "service",
    revenue_type: "one_time",
    delivery_policy: "setup_review_after_signed_payment_evidence"
  },
  "codex-team-ergonomics-pack": {
    name: "Codex Team Ergonomics Agent Pack",
    amount: 9900,
    currency: "usd",
    type: "downloadable_skill_pack",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "codex-team-ergonomics-builder-pack": {
    name: "Codex Team Ergonomics Builder Pack",
    amount: 24900,
    currency: "usd",
    type: "downloadable_skill_pack",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "codex-team-ergonomics-setup-review": {
    name: "Codex Team Ergonomics Setup Review",
    amount: 49900,
    currency: "usd",
    type: "service",
    revenue_type: "one_time",
    delivery_policy: "setup_review_after_signed_payment_evidence"
  },
  "ai-coding-team-ergonomics-bundle": {
    name: "Claude + Codex Team Ergonomics Bundle",
    amount: 24900,
    currency: "usd",
    type: "downloadable_skill_bundle",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  "ai-coding-team-ergonomics-builder-bundle": {
    name: "Claude + Codex Team Ergonomics Builder Bundle",
    amount: 49900,
    currency: "usd",
    type: "downloadable_skill_bundle",
    revenue_type: "one_time",
    delivery_policy: "download_after_signed_payment_evidence"
  },
  ai_website_seo_visibility_audit: {
    name: "AI Website SEO + AI Visibility Audit",
    amount: 19900,
    currency: "usd"
  },
  ai_business_automation_audit: {
    name: "AI Business Automation Audit",
    amount: 14900,
    currency: "usd"
  },
  ai_website_payment_cta_setup: {
    name: "AI Website + Payment CTA Setup",
    amount: 19900,
    currency: "usd"
  },
  code_dependency_security_audit: {
    name: "Code + Dependency Security Audit",
    amount: 49900,
    currency: "usd"
  },
  server_rdp_hardening_review: {
    name: "Server/RDP Hardening Review",
    amount: 29900,
    currency: "usd"
  },
  guardrail_setup_review: {
    name: "Guardrail Setup Review",
    amount: 19900,
    currency: "usd"
  },
  custom_agent_workflow_guardrail: {
    name: "Custom Agent Workflow Guardrail",
    amount: 49900,
    currency: "usd"
  },
  business_agent_reliability_system: {
    name: "Business Agent Reliability System",
    amount: 99900,
    currency: "usd"
  }
};

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function cors(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = String(env.ALLOWED_ORIGIN || "*");
  const allowOrigin = allowed === "*" || allowed.split(",").map((item) => item.trim()).includes(origin) ? origin || "*" : allowed.split(",")[0].trim();
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,stripe-signature,x-atlas-relay-secret",
    "access-control-max-age": "86400"
  };
}

function withCors(request, response, env) {
  const headers = new Headers(response.headers);
  Object.entries(cors(request, env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function rateLimit(request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const bucket = memoryRateLimit.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  memoryRateLimit.set(ip, bucket);
  return bucket.count <= RATE_LIMIT_MAX;
}

function adminAuthorized(request, env) {
  const expected = String(env.ATLAS_RELAY_SECRET || "");
  const provided = request.headers.get("x-atlas-relay-secret") || "";
  return Boolean(expected) && provided === expected;
}

function serviceFor(id) {
  return SERVICE_CATALOG[String(id || "")] || null;
}

function formEncode(payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else {
      params.append(key, String(value));
    }
  });
  return params;
}

const STRIPE_KEY_PREFIXES = {
  testSecret: "s" + "k" + "_test_",
  testRestricted: "r" + "k" + "_test_",
  liveSecret: "s" + "k" + "_live_",
  liveRestricted: "r" + "k" + "_live_"
};

function redactStripeDiagnosticText(value) {
  const text = String(value || "");
  return text
    .replace(/\b(?:s|r)k_(?:live|test)_[A-Za-z0-9]{12,}\b/g, "[REDACTED_STRIPE_KEY]")
    .replace(new RegExp("\\b" + "wh" + "sec_" + "[A-Za-z0-9]{8,}\\b", "g"), "[REDACTED_WEBHOOK_SECRET]");
}

function classifyStripeCheckoutError(error) {
  const type = String(error?.type || "");
  const code = String(error?.code || "");
  const param = String(error?.param || "");
  const message = String(error?.message || "");
  const joined = `${type} ${code} ${param} ${message}`.toLowerCase();
  return {
    permission_suspected:
      joined.includes("permission") ||
      joined.includes("restricted") ||
      joined.includes("api key") ||
      joined.includes("not authorized"),
    payload_suspected:
      joined.includes("invalid") ||
      joined.includes("missing") ||
      type === "invalid_request_error",
    mode_suspected: param === "mode" || joined.includes("mode"),
    url_suspected: param.includes("url") || joined.includes("url"),
    amount_currency_suspected:
      param.includes("amount") ||
      param.includes("currency") ||
      joined.includes("amount") ||
      joined.includes("currency"),
    metadata_suspected: param.includes("metadata") || joined.includes("metadata")
  };
}

function stripeCheckoutErrorDiagnostic(status, data) {
  const error = data?.error || {};
  const classification = classifyStripeCheckoutError(error);
  return {
    stripe_status: status,
    stripe_error_type: error.type || null,
    stripe_error_code: error.code || null,
    stripe_error_param: error.param || null,
    stripe_error_message_redacted: error.message ? redactStripeDiagnosticText(error.message) : null,
    ...classification
  };
}

function secretMode(env) {
  const key = String(env.STRIPE_SECRET_KEY || "");
  if (!key) return "missing";
  if (key.startsWith(STRIPE_KEY_PREFIXES.liveSecret) || key.startsWith(STRIPE_KEY_PREFIXES.liveRestricted)) return "live";
  if (key.startsWith(STRIPE_KEY_PREFIXES.testSecret) || key.startsWith(STRIPE_KEY_PREFIXES.testRestricted)) return "test";
  return "unknown";
}

function checkoutModePolicy(env) {
  const configuredMode = String(env.STRIPE_MODE || "test").toLowerCase();
  const keyMode = secretMode(env);
  if (keyMode === "missing") return { ok: false, status: "stripe_worker_secrets_missing" };
  if (keyMode === "unknown") return { ok: false, status: "stripe_secret_mode_unknown" };
  if (configuredMode === "test" && keyMode === "live") {
    return { ok: false, status: "stripe_live_secret_configured_while_worker_mode_test" };
  }
  if (configuredMode === "live" && keyMode === "test") {
    return { ok: false, status: "stripe_test_secret_configured_while_worker_mode_live" };
  }
  if (keyMode === "live" && String(env.STRIPE_LIVE_CHECKOUT_APPROVED || "").toLowerCase() !== "true") {
    return { ok: false, status: "stripe_live_checkout_requires_mark_approval" };
  }
  return { ok: true, status: "stripe_checkout_mode_policy_passed", mode: configuredMode };
}

function checkoutSessionSnapshot(session) {
  const metadata = session.metadata || {};
  return {
    id: session.id || null,
    object: session.object || null,
    mode: session.mode || null,
    status: session.status || null,
    payment_status: session.payment_status || null,
    livemode: Boolean(session.livemode),
    amount_total: session.amount_total ?? null,
    currency: session.currency || null,
    payment_intent: session.payment_intent || null,
    metadata: {
      order_id: metadata.order_id || null,
      pack_id: metadata.pack_id || null,
      service_id: metadata.service_id || null,
      service_type: metadata.service_type || null,
      amount_cents: metadata.amount_cents || null,
      currency: metadata.currency || null,
      delivery_requires_verified_payment: metadata.delivery_requires_verified_payment || null
    },
    url_present: Boolean(session.url),
    url_is_payment_proof: false
  };
}

async function createCheckoutSession(request, env) {
  if (!rateLimit(request)) return json({ ok: false, status: "rate_limited" }, 429);
  const modePolicy = checkoutModePolicy(env);
  if (!modePolicy.ok) {
    const status = modePolicy.status === "stripe_worker_secrets_missing" ? 503 : 409;
    return json({ ok: false, status: modePolicy.status, payment_verified: false, delivery_requires_verified_payment: true }, status);
  }
  const body = await request.json().catch(() => ({}));
  const packId = String(body.pack_id || body.service_id || "");
  const service = serviceFor(body.service_id) || serviceFor(packId);
  if (!service) return json({ ok: false, status: "invalid_service_id" }, 400);
  const serviceId = String(body.service_id || packId);
  const orderId = body.order_id || `atlas_${serviceId.replace(/[^a-z0-9_-]/gi, "_")}_${crypto.randomUUID()}`;
  const successBase = String(body.success_base_url || env.STRIPE_SUCCESS_BASE_URL || "https://mark72772.github.io/atlasops-ai-site").replace(/\/$/, "");
  const cancelBase = String(body.cancel_base_url || env.STRIPE_CANCEL_BASE_URL || successBase).replace(/\/$/, "");
  const success = `${successBase}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancel = `${cancelBase}/guardrails.html`;
  const customerEmail = String(body.customer_email || "").trim() || undefined;
  const metadata = {
    order_id: orderId,
    lead_id: body.lead_id || "",
    service_id: serviceId,
    pack_id: packId,
    service_name: service.name,
    service_type: service.type || (packId ? "downloadable_guardrail_kit" : "service_checkout"),
    amount_cents: String(service.amount),
    currency: service.currency,
    revenue_type: service.revenue_type || "one_time",
    subscription_plan_id: service.subscription_plan_id || "",
    evidence_required: "true",
    source: body.source || "guardrail_store",
    source_url: body.source_url || "",
    delivery_requires_verified_payment: "true",
    atlas_policy_scope: "local_atlas_only",
    client_website: body.client_website || body.business_url || ""
  };
  if (service.revenue_type === "quote_subscription") {
    return json({
      ok: false,
      status: "custom_quote_required",
      exact_gate: "custom_quote_required",
      payment_verified: false,
      subscription_active: false,
      mrr_cents: 0,
      checkout_session_url_is_payment_proof: false
    }, 409);
  }
  const sessionMode = service.revenue_type === "subscription" ? "subscription" : "payment";
  const subscriptionPriceId = service.revenue_type === "subscription" ? String(env[service.price_env] || "") : "";
  if (service.revenue_type === "subscription" && !subscriptionPriceId) {
    return json({
      ok: false,
      status: "recurring_price_id_missing",
      exact_gate: "recurring_price_id_missing",
      payment_verified: false,
      subscription_active: false,
      mrr_cents: 0,
      checkout_session_url_is_subscription_proof: false,
      signed_stripe_subscription_or_invoice_evidence_required: true
    }, 409);
  }
  const payloadBase = {
    mode: sessionMode,
    success_url: success,
    cancel_url: cancel,
    customer_email: customerEmail,
    "line_items[0][quantity]": "1",
    "metadata[order_id]": metadata.order_id,
    "metadata[lead_id]": metadata.lead_id,
    "metadata[service_id]": metadata.service_id,
    "metadata[pack_id]": metadata.pack_id,
    "metadata[service_name]": metadata.service_name,
    "metadata[service_type]": metadata.service_type,
    "metadata[amount_cents]": metadata.amount_cents,
    "metadata[currency]": metadata.currency,
    "metadata[revenue_type]": metadata.revenue_type,
    "metadata[subscription_plan_id]": metadata.subscription_plan_id,
    "metadata[evidence_required]": metadata.evidence_required,
    "metadata[source]": metadata.source,
    "metadata[source_url]": metadata.source_url,
    "metadata[delivery_requires_verified_payment]": metadata.delivery_requires_verified_payment,
    "metadata[atlas_policy_scope]": metadata.atlas_policy_scope,
    "metadata[client_website]": metadata.client_website
  };
  const lineItemPayload = service.revenue_type === "subscription"
    ? { "line_items[0][price]": subscriptionPriceId }
    : {
        "line_items[0][price_data][currency]": service.currency,
        "line_items[0][price_data][product_data][name]": service.name,
        "line_items[0][price_data][unit_amount]": service.amount
      };
  const payload = formEncode({ ...payloadBase, ...lineItemPayload });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": "2026-02-25.clover"
    },
    body: payload
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const diagnostic = stripeCheckoutErrorDiagnostic(response.status, data);
    return json({
      ok: false,
      status: "stripe_checkout_session_create_failed",
      ...diagnostic,
      payment_verified: false,
      delivery_requires_verified_payment: true
    }, 502);
  }
  return json({
    ok: true,
    status: "stripe_checkout_session_created",
    order_id: orderId,
    checkout_url: data.url,
    url: data.url,
    session_id: data.id,
    checkout_session: checkoutSessionSnapshot(data),
    checkout_session_url_is_payment_proof: false,
    checkout_success_redirect_is_payment_proof: false,
    payment_proof_required: "signed_stripe_webhook_event",
    payment_verified: false,
    live_revenue_cents: 0,
    delivery_requires_verified_payment: true
  });
}

async function createPaymentLink(request, env) {
  if (!rateLimit(request)) return json({ ok: false, status: "rate_limited" }, 429);
  const body = await request.json().catch(() => ({}));
  const service = serviceFor(body.service_id);
  if (!service) return json({ ok: false, status: "invalid_service_id" }, 400);
  return json({
    ok: false,
    status: "external_gate_stripe_payment_link_price_id_required",
    payment_verified: false,
    note: "Payment Links must be created server-side from mapped Stripe Price IDs; links are never payment evidence."
  }, 409);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const pieces = Object.fromEntries(header.split(",").map((part) => part.split("=", 2)));
  const timestamp = pieces.t;
  const v1 = header.split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !v1.length) return false;
  const data = new TextEncoder().encode(`${timestamp}.${rawBody}`);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, data));
  return v1.includes(digest);
}

function checkoutEvidenceReview(event, obj, metadata, amountTotal, currency, paymentStatus, checkoutStatus) {
  const reasons = [];
  const isCheckoutCompleted = event.type === "checkout.session.completed";
  if (!isCheckoutCompleted) {
    reasons.push("non_checkout_session_completed_event_requires_reconciliation");
  }
  if (isCheckoutCompleted && obj.object !== "checkout.session") {
    reasons.push("event_object_not_checkout_session");
  }
  if (isCheckoutCompleted && checkoutStatus !== "complete") {
    reasons.push("checkout_session_not_complete");
  }
  if (isCheckoutCompleted && paymentStatus !== "paid") {
    reasons.push("checkout_session_payment_status_not_paid");
  }
  const requiredMetadata = ["order_id", "amount_cents", "currency", "delivery_requires_verified_payment"];
  for (const key of requiredMetadata) {
    if (!metadata[key]) reasons.push(`missing_metadata_${key}`);
  }
  const expectedAmount = Number.parseInt(metadata.amount_cents || "", 10);
  if (!Number.isFinite(expectedAmount) || expectedAmount !== Number(amountTotal)) {
    reasons.push("amount_total_metadata_mismatch");
  }
  if (String(metadata.currency || "").toLowerCase() !== currency) {
    reasons.push("currency_metadata_mismatch");
  }
  if (String(metadata.delivery_requires_verified_payment || "") !== "true") {
    reasons.push("delivery_requires_verified_payment_metadata_missing");
  }
  if (!metadata.pack_id && metadata.service_type === "downloadable_guardrail_kit") {
    reasons.push("missing_metadata_pack_id");
  }
  const acceptedForDelivery = isCheckoutCompleted && reasons.length === 0;
  return {
    review_required: !acceptedForDelivery,
    review_required_reasons: reasons,
    accepted_for_delivery: acceptedForDelivery,
    evidence_status: acceptedForDelivery
      ? event.livemode
        ? "verified_live_payment"
        : "verified_test_payment_only"
      : "review_required"
  };
}

function evidenceFromEvent(event) {
  const obj = event.data?.object || {};
  const charge = obj.latest_charge || obj.charge || null;
  const metadata = obj.metadata || {};
  const isSubscriptionEvent = event.type.startsWith("invoice.") || event.type.startsWith("customer.subscription.") || metadata.revenue_type === "subscription";
  const amountTotal = obj.amount_total || obj.amount_received || obj.amount || 0;
  const currency = String(obj.currency || metadata.currency || "usd").toLowerCase();
  const paymentStatus = obj.payment_status || (event.type.includes("failed") ? "failed" : event.type.includes("refunded") ? "refunded" : "paid");
  const checkoutStatus = obj.object === "checkout.session" ? obj.status || null : null;
  const review = checkoutEvidenceReview(event, obj, metadata, amountTotal, currency, paymentStatus, checkoutStatus);
  const signedSubscriptionEvidence = Boolean(event.livemode) && isSubscriptionEvent && ["checkout.session.completed", "invoice.paid", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.resumed"].includes(event.type);
  const failedSubscriptionEvidence = Boolean(event.livemode) && isSubscriptionEvent && ["invoice.payment_failed", "customer.subscription.deleted", "customer.subscription.paused"].includes(event.type);
  return {
    event_id: event.id,
    event_type: event.type,
    livemode: Boolean(event.livemode),
    verified_signature: true,
    created: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    checkout_session_id: obj.object === "checkout.session" ? obj.id : null,
    checkout_session_status: checkoutStatus,
    checkout_session_url_is_payment_proof: false,
    payment_intent_id: obj.payment_intent || (obj.object === "payment_intent" ? obj.id : null),
    charge_id: typeof charge === "string" ? charge : obj.object === "charge" ? obj.id : null,
    amount_total: amountTotal,
    currency,
    payment_status: paymentStatus,
    customer_email: obj.customer_details?.email || obj.receipt_email || null,
    metadata,
    revenue_type: metadata.revenue_type || (isSubscriptionEvent ? "subscription" : "one_time"),
    subscription_plan_id: metadata.subscription_plan_id || null,
    subscription_id: obj.subscription || (obj.object === "subscription" ? obj.id : null),
    invoice_id: obj.object === "invoice" ? obj.id : null,
    signed_live_subscription_event: signedSubscriptionEvidence,
    failed_live_subscription_event: failedSubscriptionEvidence,
    review_required: review.review_required,
    review_required_reasons: review.review_required_reasons,
    evidence_status: signedSubscriptionEvidence ? "verified_live_subscription_event" : failedSubscriptionEvidence ? "verified_live_subscription_lifecycle_event" : review.evidence_status,
    accepted_for_delivery: review.accepted_for_delivery,
    verified_test_payment: review.accepted_for_delivery && !event.livemode,
    verified_live_payment: review.accepted_for_delivery && Boolean(event.livemode),
    live_revenue_cents: review.accepted_for_delivery && event.livemode ? amountTotal : 0,
    raw_event_redacted: true
  };
}

async function storeEvidence(env, evidence) {
  const store = env.ATLAS_PAYMENTS || env.PAYMENT_EVENTS;
  if (store && store.put) {
    await store.put(evidence.event_id, JSON.stringify(evidence));
  } else {
    memoryEvents.set(evidence.event_id, evidence);
  }
}

async function listEvidence(env) {
  const store = env.ATLAS_PAYMENTS || env.PAYMENT_EVENTS;
  if (store && store.list) {
    const keys = await store.list({ limit: 100 });
    const rows = [];
    for (const key of keys.keys) {
      const value = await store.get(key.name, "json");
      if (value) rows.push(value);
    }
    return rows;
  }
  return Array.from(memoryEvents.values());
}

async function webhook(request, env) {
  const rawBody = await request.text();
  const verified = await verifyStripeSignature(rawBody, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return json({ ok: false, status: "stripe_webhook_signature_rejected" }, 400);
  const event = JSON.parse(rawBody);
  const evidence = evidenceFromEvent(event);
  await storeEvidence(env, evidence);
  return json({
    ok: true,
    status: "stripe_webhook_event_verified",
    event_id: evidence.event_id,
    event_type: evidence.event_type,
    evidence_status: evidence.evidence_status,
    review_required: evidence.review_required,
    accepted_for_delivery: evidence.accepted_for_delivery
  });
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return withCors(request, new Response(null, { status: 204 }), env);
  if (url.pathname === "/health") return json({ ok: true, status: "atlasops_stripe_gateway_online", version: WORKER_VERSION, local_runtime_exposed: false });
  if (url.pathname === "/stripe/config") return withCors(request, json({ ok: true, publishableKey: env.STRIPE_PUBLISHABLE_KEY || "", mode: env.STRIPE_MODE || "test", liveCheckoutApproved: String(env.STRIPE_LIVE_CHECKOUT_APPROVED || "").toLowerCase() === "true" }), env);
  if (url.pathname === "/stripe/create-checkout-session" && request.method === "POST") return withCors(request, await createCheckoutSession(request, env), env);
  if (url.pathname === "/stripe/create-payment-link" && request.method === "POST") return withCors(request, await createPaymentLink(request, env), env);
  if (url.pathname === "/stripe/webhook" && request.method === "POST") return webhook(request, env);
  if (url.pathname === "/admin/payments" && request.method === "GET") {
    if (!adminAuthorized(request, env)) return json({ ok: false, status: "admin_unauthorized" }, 401);
    return json({ ok: true, payments: await listEvidence(env), raw_events_redacted: true });
  }
  if (url.pathname.startsWith("/admin/payment/") && request.method === "GET") {
    if (!adminAuthorized(request, env)) return json({ ok: false, status: "admin_unauthorized" }, 401);
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const rows = await listEvidence(env);
    return json({ ok: true, payment: rows.find((row) => row.event_id === id) || null });
  }
  if (url.pathname === "/admin/ack-payment" && request.method === "POST") {
    if (!adminAuthorized(request, env)) return json({ ok: false, status: "admin_unauthorized" }, 401);
    return json({ ok: true, status: "ack_recorded_locally_by_atlas_required" });
  }
  if (url.pathname === "/admin/clear-test-data" && request.method === "POST") {
    if (!adminAuthorized(request, env)) return json({ ok: false, status: "admin_unauthorized" }, 401);
    memoryEvents.clear();
    return json({ ok: true, status: "test_data_cleared_from_memory_store" });
  }
  return json({ ok: false, status: "not_found" }, 404);
}

export default {
  fetch(request, env) {
    return handle(request, env).catch(() => json({ ok: false, status: "stripe_gateway_error" }, 500));
  }
};

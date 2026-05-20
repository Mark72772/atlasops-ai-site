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

async function createCheckoutSession(request, env) {
  if (!rateLimit(request)) return json({ ok: false, status: "rate_limited" }, 429);
  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, status: "stripe_worker_secrets_missing" }, 503);
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
  const metadata = {
    order_id: orderId,
    lead_id: body.lead_id || "",
    service_id: serviceId,
    pack_id: packId,
    service_name: service.name,
    service_type: packId ? "downloadable_guardrail_kit" : "service_checkout",
    amount_cents: String(service.amount),
    currency: service.currency,
    source: body.source || "guardrail_store",
    source_url: body.source_url || "",
    delivery_requires_verified_payment: "true",
    atlas_runtime: "local_only",
    client_website: body.client_website || body.business_url || ""
  };
  const payload = formEncode({
    mode: "payment",
    success_url: success,
    cancel_url: cancel,
    customer_email: body.customer_email || "",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": service.currency,
    "line_items[0][price_data][product_data][name]": service.name,
    "line_items[0][price_data][unit_amount]": service.amount,
    "metadata[order_id]": metadata.order_id,
    "metadata[lead_id]": metadata.lead_id,
    "metadata[service_id]": metadata.service_id,
    "metadata[pack_id]": metadata.pack_id,
    "metadata[service_name]": metadata.service_name,
    "metadata[service_type]": metadata.service_type,
    "metadata[amount_cents]": metadata.amount_cents,
    "metadata[currency]": metadata.currency,
    "metadata[source]": metadata.source,
    "metadata[source_url]": metadata.source_url,
    "metadata[delivery_requires_verified_payment]": metadata.delivery_requires_verified_payment,
    "metadata[atlas_runtime]": metadata.atlas_runtime,
    "metadata[client_website]": metadata.client_website
  });
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
  if (!response.ok) return json({ ok: false, status: "stripe_checkout_session_create_failed", stripe_status: response.status }, 502);
  return json({
    ok: true,
    status: "stripe_checkout_session_created",
    order_id: orderId,
    checkout_url: data.url,
    url: data.url,
    session_id: data.id,
    payment_verified: false,
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

function evidenceFromEvent(event) {
  const obj = event.data?.object || {};
  const charge = obj.latest_charge || obj.charge || null;
  return {
    event_id: event.id,
    event_type: event.type,
    livemode: Boolean(event.livemode),
    verified_signature: true,
    created: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    checkout_session_id: obj.object === "checkout.session" ? obj.id : null,
    payment_intent_id: obj.payment_intent || (obj.object === "payment_intent" ? obj.id : null),
    charge_id: typeof charge === "string" ? charge : obj.object === "charge" ? obj.id : null,
    amount_total: obj.amount_total || obj.amount_received || obj.amount || 0,
    currency: String(obj.currency || "usd").toLowerCase(),
    payment_status: obj.payment_status || (event.type.includes("failed") ? "failed" : event.type.includes("refunded") ? "refunded" : "paid"),
    customer_email: obj.customer_details?.email || obj.receipt_email || null,
    metadata: obj.metadata || {},
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
  return json({ ok: true, status: "stripe_webhook_event_verified", event_id: evidence.event_id, event_type: evidence.event_type });
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return withCors(request, new Response(null, { status: 204 }), env);
  if (url.pathname === "/health") return json({ ok: true, status: "atlasops_stripe_gateway_online", version: WORKER_VERSION, local_runtime_exposed: false });
  if (url.pathname === "/stripe/config") return withCors(request, json({ ok: true, publishableKey: env.STRIPE_PUBLISHABLE_KEY || "", mode: env.STRIPE_MODE || "test" }), env);
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

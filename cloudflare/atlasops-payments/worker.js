const WORKER_VERSION = "sprint-26-c9pg-sandbox";
const ALLOWED_ORIGINS = new Set([
  "https://mark72772.github.io",
  "https://mark72772.github.io/atlasops-ai-site",
]);
const SERVICE_CATALOG = {
  ai_business_automation_audit: { name: "AI Business Automation Audit", amount: 14900 },
  ai_website_seo_visibility_audit: { name: "AI Website SEO + AI Visibility Audit", amount: 19900 },
  automation_plus_ai_visibility_bundle: { name: "Automation + AI Visibility Bundle", amount: 29900 },
};

function json(data, status = 200, request) {
  const origin = request?.headers.get("Origin") || "";
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Atlas-Payment-Relay-Secret",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

function hashHex(input) {
  const bytes = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", bytes).then((hash) =>
    Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()
  );
}

function safeOrderId() {
  return `c9pg-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function mask(value) {
  const text = String(value || "");
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length < 8 || text.includes("*")) return text.slice(0, 32);
  return `${digits.slice(0, 6)}******${digits.slice(-4)}`;
}

function adminAllowed(request, env) {
  const required = env.ATLAS_PAYMENT_RELAY_SECRET || "";
  const provided = request.headers.get("X-Atlas-Payment-Relay-Secret") || "";
  return Boolean(required && provided && provided === required);
}

function sanitizeCallback(payload) {
  return {
    order_id: payload.order_id || payload.CallbackContext || null,
    CallbackContext: payload.CallbackContext || null,
    Status: payload.Status || null,
    ResultCode: payload.ResultCode || null,
    ResultText: payload.ResultText || null,
    ResponseCode: payload.ResponseCode || null,
    ResponseText: payload.ResponseText || null,
    TransType: payload.TransType || null,
    AuthAmt: payload.AuthAmt || null,
    MainAmt: payload.MainAmt || null,
    Brand: payload.Brand || null,
    AccountNum: mask(payload.AccountNum),
    AuthDate: payload.AuthDate || null,
    AuthTime: payload.AuthTime || null,
    created_at: new Date().toISOString(),
  };
}

async function createCheckout(request, env) {
  const body = await request.json().catch(() => ({}));
  const service = SERVICE_CATALOG[body.service_id];
  if (!service) return json({ ok: false, status: "invalid_service_id" }, 400, request);
  if (Number(body.amount_usd || service.amount / 100) * 100 !== service.amount) {
    return json({ ok: false, status: "amount_mismatch", exact_gate: "amount_must_match_service_catalog" }, 400, request);
  }
  const missing = ["C9PG_GMID", "C9PG_GTID", "C9PG_GMPW"].filter((key) => !env[key]);
  const orderId = body.order_id || safeOrderId();
  const invoiceNum = `ATL-${orderId.slice(-12).toUpperCase()}`;
  if (missing.length) {
    return json({
      ok: true,
      status: "c9pg_checkout_ready_for_credentials",
      order_id: orderId,
      invoice_num: invoiceNum,
      service_id: body.service_id,
      amount_usd: service.amount / 100,
      checkout_url: null,
      exact_gates: missing.map((key) => `${key.toLowerCase()}_required`),
      payment_verified: false,
    }, 200, request);
  }
  const webGmid = await hashHex(env.C9PG_GMID);
  const now = new Date();
  const seedTime = `${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${now.getUTCFullYear()}:${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}:${String(now.getUTCMilliseconds()).padStart(3, "0")}`;
  const seed = await hashHex(`${invoiceNum}:${webGmid}:${env.C9PG_GTID}:${seedTime}:${env.C9PG_GMPW}`);
  const callbackContext = btoa(JSON.stringify({ order_id: orderId, service_id: body.service_id }));
  const params = new URLSearchParams({
    AcceptPaymentList: env.C9PG_ACCEPT_PAYMENT_LIST || "Card",
    WebGMID: webGmid,
    SeedTime: seedTime,
    InvoiceNum: invoiceNum,
    Seed: seed,
    GTID: env.C9PG_GTID,
    CallbackUrl: `${new URL(request.url).origin}/c9pg/callback`,
    UICallbackUrl: "https://mark72772.github.io/atlasops-ai-site/payment-result.html",
    CallbackContext: callbackContext,
    MerchantName: env.C9PG_MERCHANT_NAME || "AtlasOps AI",
  });
  const checkoutUrl = `${env.C9PG_IFRAME_BASE_URL_TEST || "https://testvterm.c9pg.com/checkout"}?${params}`;
  return json({ ok: true, status: "sandbox_checkout_created", order_id: orderId, invoice_num: invoiceNum, checkout_url: checkoutUrl, payment_verified: false }, 200, request);
}

async function handleCallback(request, env) {
  const payload = await request.json().catch(() => ({}));
  const safe = sanitizeCallback(payload);
  safe.raw_payload_hash = await hashHex(JSON.stringify(payload));
  safe.verification_status = safe.Status === "success" && safe.ResponseText === "Approved" ? "approved_candidate" : "pending_or_declined";
  return json({ ok: true, status: "callback_received_safe_fields_only", event: safe, stores_card_data: false }, 200, request);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json({ ok: true }, 200, request);
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, status: "atlasops_payments_relay_ready", version: WORKER_VERSION }, 200, request);
    if (url.pathname === "/checkout/create" && request.method === "POST") return createCheckout(request, env);
    if (url.pathname.startsWith("/checkout/status/")) return json({ ok: true, status: "status_requires_admin_storage_or_callback", order_id: url.pathname.split("/").pop(), payment_verified: false }, 200, request);
    if (url.pathname === "/checkout/result") return json({ ok: true, status: "result_received", payment_verified: false }, 200, request);
    if (url.pathname === "/c9pg/callback" && request.method === "POST") return handleCallback(request, env);
    if (url.pathname.startsWith("/admin/")) {
      if (!adminAllowed(request, env)) return json({ ok: false, status: "admin_secret_required" }, 401, request);
      return json({ ok: true, status: "admin_endpoint_ready_pending_storage_binding", payments: [], revenue_usd: 0 }, 200, request);
    }
    return json({ ok: false, status: "not_found" }, 404, request);
  },
};


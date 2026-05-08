const ALLOWED_ORIGINS = new Set([
  "https://mark72772.github.io",
  "https://mark72772.github.io/atlasops-ai-site",
]);

function now() {
  return new Date().toISOString();
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = new Set([...ALLOWED_ORIGINS, ...configured]);
  if (!allowed.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-atlas-relay-secret,paypal-auth-algo,paypal-cert-url,paypal-transmission-id,paypal-transmission-sig,paypal-transmission-time",
    "vary": "Origin",
  };
}

function withCors(request, response, env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function paypalBase(env) {
  return String(env.PAYPAL_MODE || "live").toLowerCase() === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

function configured(env) {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

async function accessToken(env) {
  if (!configured(env)) throw new Error("paypal_credentials_missing");
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "authorization": `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error("paypal_oauth_failed");
  return body.access_token;
}

function adminAllowed(request, env) {
  const expected = env.ATLAS_RELAY_SECRET || "";
  const provided = request.headers.get("x-atlas-relay-secret") || "";
  return Boolean(expected && provided && provided === expected);
}

async function store(env, bucket, record) {
  if (!env.PAYPAL_CHECKOUT_STORE) return { ok: false, status: "kv_binding_missing" };
  const key = `${bucket}:${record.id || record.order_id || crypto.randomUUID()}`;
  await env.PAYPAL_CHECKOUT_STORE.put(key, JSON.stringify({ ...record, stored_at: now() }));
  return { ok: true, key };
}

async function list(env, prefix) {
  if (!env.PAYPAL_CHECKOUT_STORE) return { ok: false, status: "kv_binding_missing", records: [] };
  const keys = await env.PAYPAL_CHECKOUT_STORE.list({ prefix });
  const records = [];
  for (const key of keys.keys) {
    const value = await env.PAYPAL_CHECKOUT_STORE.get(key.name, "json");
    if (value) records.push(value);
  }
  return { ok: true, records };
}

function amountFromPayload(payload) {
  const value = String(payload.amount || "").trim();
  if (!/^\d+(\.\d{2})$/.test(value)) throw new Error("valid_amount_required");
  return value;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204, headers: corsHeaders(request, env) }), env);
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/health" && request.method === "GET") {
        return withCors(request, json({
          ok: true,
          worker: "atlas-paypal-checkout",
          paypal_credentials_configured: configured(env),
          paypal_mode: String(env.PAYPAL_MODE || "live"),
          webhook_endpoint: "/paypal/webhook",
          create_order_endpoint: "/paypal/create-order",
          capture_order_endpoint: "/paypal/capture-order",
          event_storage_ready: Boolean(env.PAYPAL_CHECKOUT_STORE),
          local_runtime_publicly_exposed: false,
          status: configured(env) ? "worker_ready_pending_paypal_live_test" : "external_gate_paypal_worker_secrets_missing",
          checked_at: now(),
        }), env);
      }
      if (path === "/paypal/create-order" && request.method === "POST") {
        const payload = await readJson(request);
        const token = await accessToken(env);
        const amount = amountFromPayload(payload);
        const currency = String(payload.currency || "USD").toUpperCase();
        const serviceId = String(payload.service_id || "atlasops_service");
        const response = await fetch(`${paypalBase(env)}/v2/checkout/orders`, {
          method: "POST",
          headers: {
            "authorization": `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [{
              custom_id: serviceId,
              description: String(payload.description || serviceId).slice(0, 120),
              amount: { currency_code: currency, value: amount },
            }],
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return withCors(request, json({ ok: false, status: "paypal_create_order_failed", paypal_status: response.status }, { status: 502 }), env);
        await store(env, "orders", { id: body.id, order_id: body.id, service_id: serviceId, amount, currency, status: body.status, created_at: now() });
        return withCors(request, json({ ok: true, id: body.id, orderID: body.id, status: body.status }), env);
      }
      if (path === "/paypal/capture-order" && request.method === "POST") {
        const payload = await readJson(request);
        const orderID = String(payload.orderID || payload.order_id || "");
        if (!orderID) return withCors(request, json({ ok: false, error: "order_id_required" }, { status: 400 }), env);
        const token = await accessToken(env);
        const response = await fetch(`${paypalBase(env)}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
          method: "POST",
          headers: {
            "authorization": `Bearer ${token}`,
            "content-type": "application/json",
          },
        });
        const body = await response.json().catch(() => ({}));
        const capture = body.purchase_units?.[0]?.payments?.captures?.[0] || null;
        await store(env, "captures", {
          id: capture?.id || orderID,
          order_id: orderID,
          service_id: payload.service_id || null,
          status: body.status || capture?.status,
          capture_id: capture?.id || null,
          payer_email: body.payer?.email_address || null,
          raw_status: response.status,
          created_at: now(),
        });
        return withCors(request, json({ ok: response.ok, status: body.status || "capture_response", orderID, capture_id: capture?.id || null }), env);
      }
      if (path === "/paypal/webhook" && request.method === "POST") {
        const payload = await readJson(request);
        const eventType = String(payload.event_type || "unknown");
        const event = {
          id: payload.id || crypto.randomUUID(),
          event_type: eventType,
          resource_type: payload.resource_type || payload.resource?.resource_type || null,
          summary: payload.summary || null,
          create_time: payload.create_time || now(),
          received_at: now(),
          headers_present: {
            paypal_transmission_id: Boolean(request.headers.get("paypal-transmission-id")),
            paypal_transmission_sig: Boolean(request.headers.get("paypal-transmission-sig")),
          },
          payload,
        };
        const stored = await store(env, "events", event);
        return withCors(request, json({ ok: true, status: "webhook_received", event_type: eventType, stored }), env);
      }
      if (path === "/admin/paypal/events" && request.method === "GET") {
        if (!adminAllowed(request, env)) return json({ ok: false, error: "admin_secret_required" }, { status: 401 });
        return json(await list(env, "events:"));
      }
      if (path === "/admin/paypal/orders" && request.method === "GET") {
        if (!adminAllowed(request, env)) return json({ ok: false, error: "admin_secret_required" }, { status: 401 });
        return json(await list(env, "orders:"));
      }
      if (path === "/admin/paypal/clear-test-data" && request.method === "POST") {
        if (!adminAllowed(request, env)) return json({ ok: false, error: "admin_secret_required" }, { status: 401 });
        if (!env.PAYPAL_CHECKOUT_STORE) return json({ ok: false, status: "kv_binding_missing" }, { status: 503 });
        for (const prefix of ["events:", "orders:", "captures:"]) {
          const keys = await env.PAYPAL_CHECKOUT_STORE.list({ prefix });
          await Promise.all(keys.keys.map((key) => env.PAYPAL_CHECKOUT_STORE.delete(key.name)));
        }
        return json({ ok: true, status: "test_data_cleared", cleared_at: now() });
      }
      return withCors(request, json({ ok: false, error: "not_found" }, { status: 404 }), env);
    } catch (error) {
      return withCors(request, json({ ok: false, error: "worker_error", detail: String(error && error.message ? error.message : error) }, { status: 500 }), env);
    }
  },
};

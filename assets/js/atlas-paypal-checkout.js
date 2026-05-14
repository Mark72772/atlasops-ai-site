(function () {
  const cfg = window.ATLAS_PAYMENTS_CONFIG || {};
  const sdkId = "atlas-paypal-sdk";
  const supportedServices = Array.isArray(cfg.services) ? cfg.services : [];

  function money(service) {
    return `$${service.amount} ${service.currency || cfg.currency || "USD"}`;
  }

  function serviceById(serviceId) {
    return supportedServices.find((service) => service.serviceId === serviceId) || supportedServices[0];
  }

  function safeWorkerUrl() {
    try {
      const url = new URL(String(cfg.checkoutWorkerUrl || ""));
      if (url.protocol !== "https:") return "";
      const host = url.hostname.toLowerCase();
      if (host === "local" + "host" || host === ["127", "0", "0", "1"].join(".")) return "";
      return url.href.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  function createFallback(target, service, reason) {
    const link = cfg.paypalMeFallback || "";
    target.innerHTML = `
      <section class="atlas-payment-card" aria-label="AtlasOps AI payment">
        <div>
          <span class="atlas-payment-kicker">Payment</span>
          <h3>${service.name}</h3>
          <p>${money(service)}</p>
        </div>
        <a class="atlas-payment-button" href="${link}" rel="noopener" target="_blank">Pay with PayPal.me</a>
        <p class="atlas-payment-note">${reason} PayPal.me remains available, but AtlasOps verifies payment from webhook/API evidence, transaction match, or explicit manual evidence before delivery.</p>
      </section>
    `;
  }

  function loadPayPalSdk() {
    if (!cfg.clientId || cfg.clientId === "PUBLIC_PAYPAL_CLIENT_ID_REQUIRED") return Promise.reject(new Error("paypal_client_id_missing"));
    if (window.paypal && window.paypal.Buttons) return Promise.resolve(window.paypal);
    const existing = document.getElementById(sdkId);
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", () => resolve(window.paypal), { once: true });
        existing.addEventListener("error", reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = sdkId;
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.clientId)}&currency=${encodeURIComponent(cfg.currency || "USD")}&intent=capture`;
      script.onload = () => resolve(window.paypal);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function renderCheckout(target, service) {
    const worker = safeWorkerUrl();
    if (!worker) {
      createFallback(target, service, "Checkout Worker is not configured yet.");
      return;
    }
    try {
      const paypal = await loadPayPalSdk();
      target.innerHTML = `
        <section class="atlas-payment-card" aria-label="AtlasOps AI payment">
          <div>
            <span class="atlas-payment-kicker">Secure checkout</span>
            <h3>${service.name}</h3>
            <p>${money(service)}</p>
          </div>
          <div class="atlas-paypal-button-host"></div>
          <p class="atlas-payment-note">Checkout payments are verified by PayPal capture/webhook/API evidence before AtlasOps marks an order paid.</p>
          <output class="atlas-payment-result" aria-live="polite"></output>
        </section>
      `;
      const result = target.querySelector(".atlas-payment-result");
      paypal.Buttons({
        createOrder: async () => {
          const response = await fetch(`${worker}/paypal/create-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              service_id: service.serviceId,
              amount: service.amount,
              currency: service.currency || cfg.currency || "USD",
              description: service.name
            })
          });
          if (!response.ok) throw new Error("paypal_create_order_failed");
          const body = await response.json();
          return body.orderID || body.id;
        },
        onApprove: async (data) => {
          const response = await fetch(`${worker}/paypal/capture-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderID: data.orderID, service_id: service.serviceId })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || !body.ok) throw new Error("paypal_capture_failed");
          result.textContent = "Payment capture was received. AtlasOps will verify the PayPal evidence before delivery starts.";
        },
        onError: () => {
          result.textContent = "PayPal checkout is not ready. Use PayPal.me fallback and keep your transaction evidence for verification.";
        }
      }).render(target.querySelector(".atlas-paypal-button-host"));
    } catch {
      createFallback(target, service, "PayPal Checkout is not ready yet.");
    }
  }

  function renderAll() {
    document.querySelectorAll("[data-atlas-payments]").forEach((target) => {
      const service = serviceById(target.getAttribute("data-default-service"));
      if (!service) return;
      if (!cfg.clientIdConfigured || !cfg.clientId) {
        createFallback(target, service, "Public PayPal Client ID is not configured yet.");
        return;
      }
      renderCheckout(target, service);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAll, { once: true });
  } else {
    renderAll();
  }
})();


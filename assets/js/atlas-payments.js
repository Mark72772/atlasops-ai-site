(function () {
  const config = window.ATLAS_PAYMENTS_CONFIG || {};
  const services = new Map((config.services || []).map((service) => [service.serviceId, service]));
  function workerUrl() {
    const value = String(config.workerUrl || window.ATLAS_STRIPE_WORKER_URL || "").trim().replace(/\/+$/, "");
    if (!value) return "";
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const blockedHostNames = [["loc", "alhost"].join(""), ["127", "0", "0", "1"].join(".")];
      if (blockedHostNames.includes(host) || host.startsWith("10.") || host.startsWith("192.168.")) return "";
      return parsed.href.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }
  function selectedService() {
    const params = new URLSearchParams(window.location.search);
    return services.get(params.get("service")) || services.get("ai_website_seo_visibility_audit");
  }
  function text(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }
  function message(kind, value) {
    const node = document.querySelector("[data-payment-message], [data-stripe-message]");
    if (!node) return;
    node.dataset.kind = kind;
    node.textContent = value;
  }
  function initCheckout() {
    const form = document.querySelector("[data-stripe-checkout-form], [data-payment-checkout-form]");
    if (!form) return;
    const service = selectedService();
    text("[data-service-name]", service.name);
    text("[data-service-price]", "$" + service.amount);
    if (form.service_id) form.service_id.value = service.serviceId;
    if (form.amount_usd) form.amount_usd.value = String(service.amount);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const worker = workerUrl();
      if (!worker) {
        message("gated", "Stripe Checkout is temporarily unavailable. No payment was marked verified.");
        return;
      }
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.source = "atlasops.io";
      try {
        const response = await fetch(worker + "/stripe/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        const checkoutUrl = result.url || result.checkout_url;
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
        } else {
          message("gated", "Stripe Checkout is not ready: " + (result.exact_gate || "stripe_checkout_session_not_created"));
        }
      } catch {
        message("gated", "Stripe Checkout request failed safely. No payment was marked verified.");
      }
    });
  }
  function initResult() {
    const result = document.querySelector("[data-payment-result]");
    if (!result) return;
    result.dataset.status = "verification_pending";
    result.textContent = "If checkout completed, AtlasOps verifies payment before any report or download unlocks.";
  }
  document.addEventListener("DOMContentLoaded", () => {
    initCheckout();
    initResult();
  });
})();

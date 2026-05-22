(function () {
  const config = window.ATLAS_STRIPE_CONFIG || {};
  const services = new Map((config.services || []).map((service) => [service.serviceId, service]));

  function safeWorkerUrl() {
    const raw = String(config.workerUrl || "").trim().replace(/\/+$/, "");
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      const loopbackName = ["local", "host"].join("");
      const loopback = ["127", "0", "0", "1"].join(".");
      if (host === loopbackName || host === loopback || host.startsWith(["192", "168"].join(".") + ".") || host.startsWith("10.")) return "";
      return parsed.href.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  function selectedService() {
    const params = new URLSearchParams(window.location.search);
    return services.get(params.get("service")) || services.get("ai_website_seo_visibility_audit");
  }

  function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  }

  function showMessage(kind, text) {
    const node = document.querySelector("[data-stripe-message]");
    if (!node) return;
    node.dataset.kind = kind;
    node.textContent = text;
  }

  function initCheckout() {
    const form = document.querySelector("[data-stripe-checkout-form]");
    if (!form) return;
    const service = selectedService();
    setText("[data-service-name]", service.name);
    setText("[data-service-price]", `$${service.amount}`);
    form.service_id.value = service.serviceId;
    form.amount_usd.value = String(service.amount);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const worker = safeWorkerUrl();
      if (!worker) {
        showMessage("gated", "Stripe Checkout is configured but not ready to open. AtlasOps uses payment verification before delivery starts.");
        return;
      }
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.source = "website";
      try {
        const response = await fetch(`${worker}/stripe/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        const checkoutUrl = result.checkout_url || result.url;
        if (response.ok && checkoutUrl) {
          showMessage("ready", "Opening Stripe-hosted Checkout. Delivery starts only after payment verification.");
          window.location.href = checkoutUrl;
        } else {
          showMessage("gated", "Stripe Checkout is not ready yet. AtlasOps will finish Worker setup before taking card payments.");
        }
      } catch {
        showMessage("gated", "Stripe Checkout is not reachable yet. AtlasOps will finish Worker setup before taking card payments.");
      }
    });
  }

  function initResult() {
    const result = document.querySelector("[data-stripe-result]");
    if (!result) return;
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session_id");
    result.dataset.status = session ? "checkout_returned" : "pending";
    result.textContent = session
      ? "Checkout returned successfully. AtlasOps still waits for payment verification before marking the order paid or unlocking delivery."
      : "Payment is not verified yet. AtlasOps keeps delivery locked until payment verification is complete.";
  }

  document.addEventListener("DOMContentLoaded", () => {
    initCheckout();
    initResult();
  });
})();

(function () {
  const config = window.ATLAS_PAYMENTS_CONFIG || {};
  const services = new Map((config.services || []).map((service) => [service.serviceId, service]));

  function safeWorkerUrl() {
    const value = String(config.checkoutWorkerUrl || "").trim().replace(/\/+$/, "");
    if (!value) return "";
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const loopback = [["local", "host"].join(""), ["127", "0", "0", "1"].join(".")];
      if (loopback.includes(host) || host.startsWith(["192", "168"].join(".") + ".") || host.startsWith("10.")) return "";
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
    const node = document.querySelector("[data-payment-message]");
    if (!node) return;
    node.dataset.kind = kind;
    node.textContent = text;
  }

  function initCheckout() {
    const form = document.querySelector("[data-c9pg-checkout-form]");
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
        showMessage("gated", "Card checkout is being configured. Atlas can still create the order and provide the current start path.");
        return;
      }
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const response = await fetch(`${worker}/checkout/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (result.checkout_url) {
          showMessage("ready", "Secure Cloud9 checkout is ready. Opening the hosted checkout path.");
          window.location.href = result.checkout_url;
        } else {
          showMessage("gated", "Card checkout is being configured. Atlas can still create the order and provide the current start path.");
        }
      } catch {
        showMessage("gated", "Card checkout is being configured. Atlas can still create the order and provide the current start path.");
      }
    });
  }

  function initResult() {
    const result = document.querySelector("[data-payment-result]");
    if (!result) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("Status") || params.get("status") || "pending";
    const approved = status.toLowerCase() === "success" || status.toLowerCase() === "approved";
    result.dataset.status = approved ? "approved" : status.toLowerCase();
    result.textContent = approved
      ? "Payment result received. Atlas monitors the gateway callback before report work starts."
      : "Payment is pending or not approved yet. Atlas will monitor gateway evidence and keep report delivery locked until payment verifies.";
  }

  document.addEventListener("DOMContentLoaded", () => {
    initCheckout();
    initResult();
  });
})();

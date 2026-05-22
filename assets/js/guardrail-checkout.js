(function () {
  function config() {
    return window.ATLAS_STRIPE_CHECKOUT_CONFIG || window.ATLAS_PAYMENTS_CONFIG || {};
  }

  function workerUrl() {
    const cfg = config();
    return String(window.ATLAS_STRIPE_WORKER_URL || cfg.workerUrl || "").trim().replace(/\/$/, "");
  }

  function updateCheckoutCopy() {
    if (!workerUrl()) return;
    document.querySelectorAll("[data-checkout-gate]").forEach((node) => {
      node.removeAttribute("data-checkout-gate");
      node.removeAttribute("aria-disabled");
      if (node.tagName === "BUTTON") {
        const price = node.dataset.price || "99";
        const productType = String(node.dataset.productType || "");
        node.textContent = productType.includes("bundle") ? "Buy Bundle" : `Buy $${price} Guardrail Kit`;
      }
      if (node.classList && node.classList.contains("checkout-note")) {
        node.textContent = "Secure Stripe Checkout. Private delivery after payment verification.";
      }
    });
  }

  function activeBaseUrl() {
    const cfg = config();
    const fallback = "https://mark72772.github.io/atlasops-ai-site";
    const base = String(cfg.activeSalesBaseUrl || cfg.fallbackSiteUrl || fallback).trim().replace(/\/$/, "");
    return base || fallback;
  }

  function setGate(button, gate, message) {
    if (button) {
      button.dataset.checkoutGate = gate;
      button.dataset.paymentProvider = "stripe";
      button.setAttribute("aria-disabled", "true");
      button.textContent = "Stripe Checkout unavailable";
    }
    window.alert(message || "Stripe Checkout could not open. No payment was marked verified.");
  }

  async function start(packId, button) {
    const worker = workerUrl();
    const gate = config().exactGate || "stripe_worker_url_missing";
    if (!worker) {
      setGate(button, gate, "Stripe Checkout could not open. No payment was marked verified.");
      return;
    }
    const base = activeBaseUrl();
    const payload = {
      pack_id: packId,
      service_id: packId,
      source: "guardrail_store",
      source_url: window.location.href,
      success_base_url: base,
      cancel_base_url: base,
      delivery_requires_verified_payment: true
    };
    try {
      const response = await fetch(`${worker}/stripe/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      const checkoutUrl = data.url || data.checkout_url;
      if (response.ok && checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      setGate(button, data.exact_gate || data.status || "stripe_checkout_session_not_created", "Stripe Checkout could not create a hosted session. No payment was marked verified.");
    } catch (error) {
      setGate(button, "stripe_worker_health_failed", "Stripe Checkout is temporarily unavailable. No payment was marked verified.");
    }
  }

  document.addEventListener("DOMContentLoaded", updateCheckoutCopy);
  window.AtlasGuardrailCheckout = { start, refresh: updateCheckoutCopy };
})();

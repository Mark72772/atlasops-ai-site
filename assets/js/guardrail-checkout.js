(function () {
  function config() {
    return window.ATLAS_STRIPE_CHECKOUT_CONFIG || window.ATLAS_PAYMENTS_CONFIG || {};
  }

  function workerUrl() {
    const cfg = config();
    return String(window.ATLAS_STRIPE_WORKER_URL || cfg.workerUrl || "").trim().replace(/\/$/, "");
  }

  function activeBaseUrl() {
    const cfg = config();
    const fallback = "https://mark72772.github.io/atlasops-ai-site";
    const base = String(cfg.activeSalesBaseUrl || cfg.fallbackSiteUrl || fallback).trim().replace(/\/$/, "");
    return base || fallback;
  }

  function setGate(button, gate, message) {
    if (button) {
      button.dataset.exactGate = gate;
      button.dataset.checkoutProvider = "stripe";
      button.setAttribute("aria-disabled", "true");
      button.textContent = "Stripe checkout is being activated";
    }
    window.alert(message || "Stripe checkout is being activated. Contact AtlasOps to purchase this kit.");
  }

  async function start(packId, button) {
    const worker = workerUrl();
    const gate = config().exactGate || "stripe_worker_url_missing";
    if (!worker) {
      setGate(button, gate, "Stripe checkout is being activated. Contact AtlasOps to purchase this kit.");
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
      setGate(button, data.exact_gate || data.status || "stripe_checkout_session_not_created", "Stripe checkout is not ready yet. AtlasOps will finish secure Stripe Worker setup before taking card payments.");
    } catch (error) {
      setGate(button, "stripe_worker_health_failed", "Stripe checkout is not reachable yet. No payment was marked verified.");
    }
  }

  window.AtlasGuardrailCheckout = { start };
})();

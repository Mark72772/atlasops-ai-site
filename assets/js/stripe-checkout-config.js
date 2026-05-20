(function () {
  window.ATLAS_STRIPE_CHECKOUT_CONFIG = Object.freeze({
    provider: "stripe",
    primaryProvider: "stripe",
    activeSalesBaseUrl: "https://mark72772.github.io/atlasops-ai-site",
    canonicalTarget: "https://atlasops.io",
    workerUrl: "",
    mode: "test_pending_worker_secrets",
    exactGate: "stripe_worker_url_missing",
    checkoutSessionIsPaymentProof: false,
    successPageUnlocksDelivery: false,
    deliveryRequiresVerifiedStripeEvidence: true
  });
})();

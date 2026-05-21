(function () {
  window.ATLAS_STRIPE_CHECKOUT_CONFIG = Object.freeze({
    provider: "stripe",
    primaryProvider: "stripe",
    activeSalesBaseUrl: "https://mark72772.github.io/atlasops-ai-site",
    canonicalTarget: "https://atlasops.io",
    workerUrl: "https://atlasops-stripe-gateway.atlasops-ai.workers.dev",
    mode: "live",
    exactGate: null,
    checkoutSessionIsPaymentProof: false,
    successPageUnlocksDelivery: false,
    deliveryRequiresVerifiedStripeEvidence: true
  });
})();


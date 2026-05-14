(function () {
  window.ATLAS_PAYMENTS_CONFIG = Object.freeze({
    provider: "c9pg",
    displayName: "Cloud9 secure checkout",
    mode: "sandbox_pending_credentials",
    currency: "USD",
    checkoutWorkerUrl: "https://atlasops-payments-relay.atlasops-ai.workers.dev",
    cardDataPolicy: "hosted_checkout_only",
    liveCardCheckoutEnabled: false,
    services: [
      {
        serviceId: "ai_business_automation_audit",
        name: "AI Business Automation Audit",
        amount: 149,
        currency: "USD",
        checkoutPath: "checkout.html?service=ai_business_automation_audit"
      },
      {
        serviceId: "ai_website_seo_visibility_audit",
        name: "AI Website SEO + AI Visibility Audit",
        amount: 199,
        currency: "USD",
        checkoutPath: "checkout.html?service=ai_website_seo_visibility_audit"
      },
      {
        serviceId: "automation_plus_ai_visibility_bundle",
        name: "Automation + AI Visibility Bundle",
        amount: 299,
        currency: "USD",
        checkoutPath: "checkout.html?service=automation_plus_ai_visibility_bundle"
      }
    ]
  });
})();


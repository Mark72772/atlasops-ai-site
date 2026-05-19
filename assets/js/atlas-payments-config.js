(function () {
  window.ATLAS_PAYMENTS_CONFIG = Object.freeze({
    provider: "stripe",
    primaryProvider: "stripe",
    cloud9Status: "deprecated_or_disabled",
    displayName: "Stripe-hosted Checkout",
    mode: "test_pending_worker_secrets",
    currency: "USD",
    workerUrl: "",
    cardDataPolicy: "stripe_hosted_checkout_only",
    paymentVerificationPolicy: "signed_webhook_or_api_evidence_required",
    canonicalSiteUrl: "https://atlasops.io/",
    fallbackSiteUrl: "https://mark72772.github.io/atlasops-ai-site/",
    services: [
      { serviceId: "ai_website_seo_visibility_audit", name: "AI Website SEO + AI Visibility Audit", amount: 199, amountCents: 19900, currency: "USD", checkoutPath: "checkout.html?service=ai_website_seo_visibility_audit" },
      { serviceId: "ai_business_automation_audit", name: "AI Business Automation Audit", amount: 149, amountCents: 14900, currency: "USD", checkoutPath: "checkout.html?service=ai_business_automation_audit" },
      { serviceId: "ai_website_payment_cta_setup", name: "AI Website + Payment CTA Setup", amount: 199, amountCents: 19900, currency: "USD", checkoutPath: "checkout.html?service=ai_website_payment_cta_setup" }
    ]
  });
})();

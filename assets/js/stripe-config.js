(function () {
  window.ATLAS_STRIPE_CONFIG = Object.freeze({
    provider: "stripe",
    displayName: "Stripe-hosted Checkout",
    mode: "live",
    currency: "USD",
    workerUrl: "https://atlasops-stripe-gateway.atlasops-ai.workers.dev",
    cardDataPolicy: "stripe_hosted_checkout_only",
    paymentVerificationPolicy: "signed_webhook_or_api_evidence_required",
    services: [
      {
        serviceId: "ai_website_seo_visibility_audit",
        name: "AI Website SEO + AI Visibility Audit",
        amount: 199,
        amountCents: 19900,
        currency: "USD",
        checkoutPath: "checkout.html?service=ai_website_seo_visibility_audit"
      },
      {
        serviceId: "ai_business_automation_audit",
        name: "AI Business Automation Audit",
        amount: 149,
        amountCents: 14900,
        currency: "USD",
        checkoutPath: "checkout.html?service=ai_business_automation_audit"
      },
      {
        serviceId: "ai_website_payment_cta_setup",
        name: "AI Website + Payment CTA Setup",
        amount: 199,
        amountCents: 19900,
        currency: "USD",
        checkoutPath: "checkout.html?service=ai_website_payment_cta_setup"
      },
      {
        serviceId: "code_dependency_security_audit",
        name: "Code + Dependency Security Audit",
        amount: 499,
        amountCents: 49900,
        currency: "USD",
        checkoutPath: "checkout.html?service=code_dependency_security_audit"
      },
      {
        serviceId: "server_rdp_hardening_review",
        name: "Server/RDP Hardening Review",
        amount: 299,
        amountCents: 29900,
        currency: "USD",
        checkoutPath: "checkout.html?service=server_rdp_hardening_review"
      }
    ]
  });
})();

(function () {
  window.ATLAS_PAYMENTS_CONFIG = Object.freeze({
    provider: "paypal",
    mode: "live",
    clientId: "",
    clientIdConfigured: false,
    currency: "USD",
    checkoutWorkerUrl: "https://atlas-paypal-checkout.atlasops-ai.workers.dev",
    paypalMeFallback: "https://www.paypal.me/markWilson385",
    secretRotationRequired: true,
    services: [
      {
        serviceId: "ai_business_automation_audit",
        name: "AI Business Automation Audit",
        amount: "149.00",
        currency: "USD"
      },
      {
        serviceId: "website_paypal_cta_setup",
        name: "AI Website + PayPal CTA Setup",
        amount: "199.00",
        currency: "USD"
      },
      {
        serviceId: "server_rdp_hardening_review",
        name: "Server/RDP Hardening Review",
        amount: "299.00",
        currency: "USD"
      },
      {
        serviceId: "code_dependency_security_audit",
        name: "Code + Dependency Security Audit",
        amount: "499.00",
        currency: "USD"
      }
    ]
  });
})();

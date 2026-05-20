# Deploy Steps

1. Rotate the exposed Stripe live key in the Stripe Dashboard.
2. Create a restricted key for Atlas with the minimum permissions required for Checkout Sessions and webhook event retrieval.
3. From this directory, run `wrangler deploy`.
4. Add Worker secrets with `wrangler secret put STRIPE_SECRET_KEY`, `wrangler secret put STRIPE_WEBHOOK_SECRET`, and `wrangler secret put ATLAS_RELAY_SECRET`.
5. Configure the Stripe webhook endpoint to `/stripe/webhook`.
6. Put the deployed Worker URL in `assets/js/stripe-checkout-config.js` or the public Atlas payments config after the Worker passes `/health`.
7. Set local Atlas `ATLAS_STRIPE_WORKER_URL` and `ATLAS_STRIPE_WORKER_ADMIN_SECRET` in the local secret store or environment.
8. Run a test-mode Checkout and confirm local Atlas imports only signed webhook evidence.

Do not commit secret values. Do not paste secret values into chat or reports.

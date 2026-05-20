# Deploy Steps

1. Rotate the exposed Stripe live key in the Stripe Dashboard.
2. Create a restricted key for Atlas with the minimum permissions required for Checkout Sessions and webhook event retrieval.
3. Add Worker secrets with `wrangler secret put STRIPE_SECRET_KEY`, `wrangler secret put STRIPE_WEBHOOK_SECRET`, and `wrangler secret put ATLAS_RELAY_SECRET`.
4. Create the payment-evidence KV namespace with `wrangler kv namespace create ATLAS_PAYMENTS`.
5. Add the generated namespace id to `wrangler.toml` under the `ATLAS_PAYMENTS` binding.
6. From this directory, run `wrangler deploy`.
7. Configure the Stripe webhook endpoint to `/stripe/webhook`.
8. Put the deployed Worker URL in `assets/js/stripe-checkout-config.js` or the public Atlas payments config after the Worker passes `/health`.
9. Set local Atlas `ATLAS_STRIPE_WORKER_URL` and `ATLAS_STRIPE_WORKER_ADMIN_SECRET` in the local secret store or environment.
10. Run a test-mode Checkout and confirm local Atlas imports only signed webhook evidence.

Do not commit secret values. Do not paste secret values into chat or reports.

# AtlasOps Stripe Gateway

Cloudflare Worker for Stripe-hosted Checkout and signed webhook payment evidence.

The public website calls `/stripe/create-checkout-session`. Card entry happens only on Stripe-hosted Checkout. The Worker verifies `Stripe-Signature` on `/stripe/webhook` before any event can become Atlas payment evidence.

Required Worker secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ATLAS_RELAY_SECRET`

Optional Worker public config:

- `STRIPE_PUBLISHABLE_KEY`

Admin evidence endpoints require `X-Atlas-Relay-Secret`. Checkout URLs and success redirects are not payment proof; local Atlas marks payment verified only from signed Stripe evidence.


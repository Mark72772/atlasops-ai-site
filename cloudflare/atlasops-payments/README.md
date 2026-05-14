# AtlasOps Payments Relay

Cloudflare Worker relay for AtlasOps AI Cloud9 / C9PG hosted checkout.

The public website calls `/checkout/create`. The Worker generates safe order context, creates Cloud9 hosted checkout parameters when credentials are present, and receives the C9PG server callback. Card entry stays on Cloud9 hosted checkout.

Security rules:

- No raw card number storage.
- No CVV storage.
- No gateway credentials in public JavaScript.
- Admin endpoints require `X-Atlas-Payment-Relay-Secret`.
- A checkout URL is not payment proof.
- Payment verification requires callback or manual evidence that matches the order.

Secrets to configure with Wrangler:

- `C9PG_GMID`
- `C9PG_GTID`
- `C9PG_GMPW`
- `ATLAS_PAYMENT_RELAY_SECRET`


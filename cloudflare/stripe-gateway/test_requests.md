# Test Requests

These requests prove the shape of the Stripe-only checkout path without exposing secrets.

```bash
curl https://<worker-host>/health
curl https://<worker-host>/stripe/config
curl -X POST https://<worker-host>/stripe/create-checkout-session \
  -H "content-type: application/json" \
  --data '{"pack_id":"social-publishing-guardrail","source":"guardrail_store","success_base_url":"https://mark72772.github.io/atlasops-ai-site","cancel_base_url":"https://mark72772.github.io/atlasops-ai-site","delivery_requires_verified_payment":true}'
curl -H "X-Atlas-Relay-Secret: <configured-locally-not-in-chat>" https://<worker-host>/admin/payments
```

Unsigned webhook events must be rejected by `/stripe/webhook`. Signed test webhook events should be stored in the `ATLAS_PAYMENTS` KV namespace. A Checkout Session URL, payment link, or success redirect is never payment evidence.

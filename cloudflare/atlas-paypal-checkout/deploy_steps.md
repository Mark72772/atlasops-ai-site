# Deploy Steps

1. Rotate the previously exposed PayPal secret in the PayPal Developer Dashboard before production use.
2. In PayPal Developer Dashboard, create or open the REST app and copy the Client ID and Secret.
3. Create a Cloudflare KV namespace for checkout evidence storage.
4. Add the KV namespace IDs to `wrangler.toml`.
5. Set Worker secrets:

```powershell
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_MODE
npx wrangler secret put ATLAS_RELAY_SECRET
```

6. Deploy:

```powershell
npx wrangler deploy
```

7. Configure PayPal webhooks for:

- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.PENDING`

8. Save the Worker URL in local Atlas payment config. Do not commit secrets.

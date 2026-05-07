# Deploy Steps

1. Confirm Cloudflare auth:
   `npx wrangler whoami`
2. Set the local-only admin secret:
   `Get-Content <local-secret-file> | npx wrangler secret put ATLAS_RELAY_SECRET`
3. Deploy:
   `npx wrangler deploy`
4. Test:
   `GET /health`
   `POST /chat/message`
   `GET /admin/summary` with `X-Atlas-Relay-Secret`

Never commit the admin secret, Gmail credentials, tokens, lead records, customer emails, browser profiles, or local Atlas logs.

# Deploy Steps

1. Verify Cloudflare auth:
   `npx wrangler whoami`
2. Set the private admin key:
   `npx wrangler secret put ATLAS_RELAY_SECRET`
3. Deploy:
   `npx wrangler deploy`
4. Test:
   `GET https://<worker-url>/health`
5. Store the Worker URL in the private private Atlas system config.
6. Add only the public Worker URL to the website config.

Never put the private admin key into public JavaScript, HTML, or GitHub.


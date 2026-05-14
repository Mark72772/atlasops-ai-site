# Deploy Steps

1. Confirm Cloud9 sandbox credentials and callback domain approval.
2. Configure Worker secrets with `wrangler secret put`.
3. Run `wrangler deploy`.
4. Verify `GET /health`.
5. Run a sandbox checkout create request.
6. Complete the C9PG sandbox transaction only with approved test instructions.
7. Confirm callback safe fields arrive.
8. Confirm local Atlas monitor can poll admin endpoints.

Do not enable live mode until Mark provides live credentials and a sandbox proof run passes.


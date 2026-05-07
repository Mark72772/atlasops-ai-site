# AtlasOps Live Chat Worker

Cloudflare Worker + Durable Object relay for the public Ask Atlas chat widget.

The public GitHub Pages site connects only to this Worker. Local Atlas connects outbound through the admin endpoints or agent WebSocket. The local Atlas runtime is never exposed publicly.

Public endpoints:
- `GET /health`
- `GET /chat/ws?session_id=<id>`
- `POST /chat/message`
- `GET /chat/reply/:session_id`
- `POST /event`
- `POST /heartbeat`
- `POST /go-click`
- `POST /lead`

Admin endpoints require `X-Atlas-Relay-Secret`:
- `GET /admin/summary`
- `GET /admin/sessions`
- `GET /admin/messages`
- `POST /admin/agent/reply`
- `POST /admin/ack`
- `GET /admin/agent/ws`
- `POST /admin/clear-test-data`

# AtlasOps LiveOps Relay

Cloudflare Worker relay for the public AtlasOps AI GitHub Pages site.

The public website posts visitor events, Ask Atlas questions, and lead submissions to this Worker. Local Atlas polls the Worker admin endpoints with a private admin header. The local Atlas runtime is never exposed publicly.

Public endpoints:
- `GET /health`
- `POST /event`
- `POST /heartbeat`
- `POST /go-click`
- `POST /lead`
- `POST /ask`
- `GET /reply/:question_id`

Admin endpoints require the private admin header:
- `GET /admin/summary`
- `GET /admin/events`
- `GET /admin/questions`
- `GET /admin/leads`
- `POST /admin/reply`
- `POST /admin/ack`
- `POST /admin/clear-test-data`

Do not commit the relay admin key, Gmail app files, Gmail auth files, lead records, customer emails, browsing state, or local Atlas runtime files.

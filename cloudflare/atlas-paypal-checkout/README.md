# Atlas PayPal Checkout Worker

This Worker handles public PayPal order creation/capture and stores webhook/order evidence for local Atlas polling. It never exposes the local Atlas runtime.

Public endpoints:

- `GET /health`
- `POST /paypal/create-order`
- `POST /paypal/capture-order`
- `POST /paypal/webhook`

Admin endpoints require `X-Atlas-Relay-Secret`:

- `GET /admin/paypal/events`
- `GET /admin/paypal/orders`
- `POST /admin/paypal/clear-test-data`

Secrets must be configured through Cloudflare Worker secrets only. Do not put PayPal secrets in GitHub Pages, public JavaScript, reports, screenshots, or committed config.

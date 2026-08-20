# SignalDrift

SignalDrift is Skald and Kreepy Productions' reusable product-to-market operating system. It connects acquisition sources, product activity, campaigns, and conversions so launches can learn instead of guessing.

## v0.1 vertical slice

- PathSeal is the first seeded product.
- Generate campaign URLs with UTM attribution.
- Record visits, signups, uploads, checkout starts, and subscriptions.
- Compare source performance and the conversion path.
- Export the event history as CSV.
- Data stays in browser storage for this first standalone build.

## Run

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run build
```

Production runs the built dashboard and API together with `npm start`.
Use **Load live data** and enter the access key when you want to replace the browser's demo events with the latest stored events. The key is held only for that request and is not saved.

## Event-ingestion API

The live-wiring boundary accepts authenticated product events. When `MONGO_URL` (or `MONGODB_URI`) is set, events are stored in the existing Atlas cluster inside SignalDrift's separate `signaldrift.events` collection. Without a MongoDB URI, development falls back to a local JSONL event log.

```bash
SIGNALDRIFT_INGEST_KEY="replace-with-a-long-random-secret" \
SIGNALDRIFT_ALLOWED_ORIGIN="https://your-product.example" \
MONGO_URL="mongodb+srv://..." \
SIGNALDRIFT_DB_NAME="signaldrift" \
npm run start:api
```

Send `POST /api/events` with `Authorization: Bearer <key>` and JSON containing `product`, `type`, and optional attribution fields (`source`, `medium`, `campaign`, `visitorId`, `userId`, `occurredAt`). Supported types are `visit`, `signup`, `upload`, `checkout_started`, and `subscription`.

The bearer key belongs only in a trusted backend. A public browser app must send events through its own server; it must never expose the ingestion key in frontend code.

## Owned tracking links

SignalDrift can record a campaign click and then redirect to a server-approved HTTPS destination. Visitors cannot supply or override the destination. Configure an explicit hostname allowlist and a JSON object of named links:

```text
SIGNALDRIFT_REDIRECT_HOSTS="approved-product.example"
SIGNALDRIFT_TRACKING_LINKS='{"pathseal-linkedin-01":{"destination":"https://approved-product.example/start?utm_source=linkedin&utm_medium=social&utm_campaign=campaign-01","product":"pathseal","source":"linkedin","medium":"social","campaign":"campaign-01"}}'
```

The public URL is `/go/pathseal-linkedin-01`. SignalDrift stores a `campaign_click` event before returning the redirect. Unknown links return `404`; a storage failure returns `503` without redirecting. Link configuration is deployment-only and contains no secrets.

Keep the Atlas connection string in the deployment environment only. Reuse the existing cluster credentials, grant the application account access to the `signaldrift` database, and do not commit the URI.

## Integration boundary

This version deliberately proves the interface and data model without pretending external automation exists. The ingestion boundary and shared-cluster database storage are implemented; PathSeal server-side wiring comes next. Email automations follow only after real identity, consent, and subscription state are available.


# Ghaith Web Content OS

A runnable TypeScript/Node.js orchestration layer that mirrors the existing Ghaith Web workflow rather than replacing it:

**Reports / Intelligence → Opportunity → Content → Assets → IN REVIEW → Human approval → ClickUp READY → Make → public platforms → PUBLISHED → SUCCESS/WARNING/ERROR → Analytics**

## What is included

- Unified `ContentItem` and publishing log models.
- Hard approval gate: publishing is impossible unless status is `READY`.
- ClickUp adapter for task status sync.
- Make webhook adapter with retry/backoff.
- Generic platform registry: Facebook, Instagram, TikTok, Pinterest, YouTube, X, or any future platform.
- Idempotency/duplicate prevention per content + platform + revision.
- Google Drive direct text-manifest upload adapter.
- Optional OpenAI intelligence/content generation.
- Optional Semrush enrichment bridge.
- Optional Canva and HeyGen automation bridges.
- JSON persistence for zero-setup local operation.
- REST API + full responsive Arabic RTL web app / installable PWA.
- Tests and Mermaid architecture.

## Requirements

- Node.js 22+
- npm
- No runtime npm dependencies; only TypeScript tooling is installed for development/build.
- External credentials only for integrations you actually enable.

## Quick start

The ZIP includes a prebuilt `dist/`, so you can start immediately with Node.js 22+:

```bash
cp .env.example .env
node --env-file=.env dist/src/server.js
```

Open `http://localhost:3000`.

If you want to edit/rebuild the TypeScript source:

```bash
npm install
npm run build
npm start
```

Without external credentials the app still starts. The default publishing mode is **`clickup_watch`**, which mirrors the current Ghaith Web workflow: human approval → ClickUp READY → the existing Make Watch Tasks scenario. Set `PUBLISH_MODE=webhook` only if you intentionally want the app to call a Make custom webhook directly.

## Production build

```bash
npm install
npm run build
npm start
```

For production, mount `./data` on persistent storage or replace `JsonDb` with a database repository.

## API

### Ingest a report

```bash
curl -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"title":"Daily intelligence","body":"People need faster AI workflows for teachers..."}'
```

### Extract opportunities

```bash
curl -X POST http://localhost:3000/api/reports/REPORT_ID/opportunities
```

### Create content from an opportunity

```bash
curl -X POST http://localhost:3000/api/opportunities/OPPORTUNITY_ID/content \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["facebook","instagram","tiktok","pinterest","youtube","x"]}'
```

Generated content starts at `IN_REVIEW`.

### Approve

```bash
curl -X POST http://localhost:3000/api/content/CONTENT_ID/approve \
  -H 'Content-Type: application/json' \
  -d '{"approvedBy":"owner"}'
```

Generated content is automatically mirrored to ClickUp when ClickUp credentials are configured. Approval changes the internal status to `READY` and also moves the linked ClickUp task to the configured READY status.

### Dispatch / Publish

```bash
curl -X POST http://localhost:3000/api/content/CONTENT_ID/publish
```

With `PUBLISH_MODE=clickup_watch`, this verifies READY and hands off through ClickUp so the existing Make Watch Tasks scenario can process it. With `PUBLISH_MODE=webhook`, the app sends normalized platform payloads directly to the configured Make webhook.

Make can optionally call `POST /api/webhooks/make` with SUCCESS/WARNING/ERROR to synchronize the app dashboard and final PUBLISHED state.

### Metrics

`GET /api/metrics`

Returns counts for DRAFT / IN_PROGRESS / IN_REVIEW / READY / PUBLISHED / ARCHIVED, SUCCESS/WARNING/ERROR, publishing success rate, and publishing counts by platform.

## Make contract

Configure `MAKE_WEBHOOK_URL` to point at a Make custom webhook. The payload is intentionally platform-agnostic:

```json
{
  "contentId": "...",
  "clickupTaskId": "...",
  "platform": "instagram",
  "title": "...",
  "caption": "...",
  "description": "...",
  "mediaUrls": ["..."],
  "mediaType": "multi-platform-package",
  "status": "READY",
  "idempotencyKey": "..."
}
```

Your existing Make Router should route on `platform`, publish, update ClickUp, and return JSON when possible:

```json
{
  "success": true,
  "publicUrl": "https://...",
  "executionId": "..."
}
```

## Adding a new platform without modifying Core

For the standard Make-based flow:

1. Add the platform name to `SUPPORTED_PLATFORMS` in `.env`, e.g. `threads`.
2. Add a `threads` route in the existing Make Router.
3. Restart the app.

No Core service changes are required. For a platform that must publish directly, implement the `PlatformAdapter` interface and register it in `PlatformRegistry`.

## Integration notes

### OpenAI

Set `OPENAI_API_KEY`. The adapter calls the Responses API directly with `fetch` and defaults to `gpt-5.6`. Change `OPENAI_MODEL` if desired.

### ClickUp

Set `CLICKUP_API_TOKEN` and `CLICKUP_LIST_ID`. Existing tasks can be linked by setting `clickupTaskId` on a content item through `PATCH /api/content/:id`.

### Google Drive

The included direct adapter uses an OAuth access token and optional folder ID for asset manifests. In a long-running deployment, replace the static access token with your OAuth refresh-token flow/service account policy.

### Canva / HeyGen

The project exposes optional automation bridges via `CANVA_AUTOMATION_WEBHOOK_URL` and `HEYGEN_AUTOMATION_WEBHOOK_URL`. These are deliberately decoupled from Core because authentication and available creation APIs can vary by account/product. They can point to Make scenarios, your own OAuth gateway, or another approved integration layer.

### Semrush

`SEMRUSH_API_URL` + `SEMRUSH_API_KEY` provide an optional enrichment bridge. Keep the endpoint configurable so plan/API changes do not affect the Core.

## Safety / approval design

- `publish()` rejects anything not in `READY`.
- `PUBLISHED` is only set after all target platforms have returned SUCCESS/WARNING.
- A SHA-256 idempotency key is stored per content + platform + revision.
- Existing SUCCESS logs prevent duplicate publishing on retries.
- No secrets are committed; use `.env`.
- With no Make webhook, publishing is a dry run rather than an accidental live post.

## Tests

```bash
npm test
npm run check
```

## Project structure

```text
src/
  config/          Environment and supported platforms
  core/            Domain models and errors
  integrations/    OpenAI, ClickUp, Make, Drive, Semrush, Canva, HeyGen
  platforms/       Generic Platform Adapter + registry
  repositories/    JSON persistence
  routes/          REST API
  services/        Intelligence, content, approval, assets, publish, metrics
  web/             Lightweight dashboard
tests/
ARCHITECTURE.md
.env.example
```

See `ARCHITECTURE.md` for the Mermaid diagram.


## Arabic app setup

See `APP_SETUP_AR.md` for the shortest setup guide for the current Ghaith Web ClickUp + Make workflow.

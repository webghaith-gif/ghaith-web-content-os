# Notification fix — 2026-08-22

Operational patch on top of the preserved V18 stable snapshot.

- Push notifications received while the app is closed are persisted in IndexedDB and surfaced in the in-app notification center.
- Report/content/assets notification links prefer the exact Google Drive file instead of a generic app section.
- Product-review notification clicks resolve the exact Google Drive draft using the product id.
- The preserved branch `stable-v18-report-pipeline-2026-08-22` remains unchanged and is the rollback point.

# Implementation Notes — App Edition

- Full responsive Arabic RTL web interface added.
- PWA manifest + service worker added, so the web app can be installed on supported devices.
- Dashboard, reports, opportunities, content review, approval, assets, publishing logs and integrations views are included.
- Approval remains a hard gate. The UI cannot set READY/PUBLISHED by arbitrary PATCH.
- Default publishing mode is `clickup_watch`, matching the existing ClickUp → Make workflow.
- `PUBLISH_MODE=webhook` is vendor-neutral: `PUBLISH_WEBHOOK_URL` may point to Make, n8n, or a compatible custom API. Legacy `MAKE_WEBHOOK_URL`/`MAKE_WEBHOOK_SECRET` remain supported so the current scenario does not need migration.
- The existing Make callback endpoint remains backward-compatible and synchronizes SUCCESS/WARNING/ERROR, marking content PUBLISHED only after all target platforms complete.
- Platform list remains configurable through `SUPPORTED_PLATFORMS`.
- External secrets are server-side environment variables only.
- Current ClickUp list ID is prefilled in `.env.example`; the API token is intentionally blank.
- Persistent PostgreSQL storage is implemented through `PostgresDb` and selected automatically when `DATABASE_URL` is present.
- PostgreSQL mutations run inside transactions and lock the singleton state row before update, preventing lost updates between concurrent writers.
- `JsonDb` remains a zero-setup local fallback; production deployments should use PostgreSQL.
- CI starts a real PostgreSQL service and tests persistence plus transaction rollback in addition to the existing approval/idempotency/platform/Make tests.

# Implementation Notes — App Edition

- Full responsive Arabic RTL web interface added.
- PWA manifest + service worker added, so the web app can be installed on supported devices.
- Dashboard, reports, opportunities, content review, approval, assets, publishing logs and integrations views are included.
- Approval remains a hard gate. The UI cannot set READY/PUBLISHED by arbitrary PATCH.
- Default publishing mode is `clickup_watch`, matching the existing ClickUp → Make workflow.
- Optional Make callback endpoint synchronizes SUCCESS/WARNING/ERROR and marks content PUBLISHED after all target platforms complete.
- Platform list remains configurable through `SUPPORTED_PLATFORMS`.
- External secrets are server-side environment variables only.
- Current ClickUp list ID is prefilled in `.env.example`; the API token is intentionally blank.
- 5 automated tests pass, including approval, idempotency, platform extensibility, and Make callback completion.

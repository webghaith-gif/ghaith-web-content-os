# Ghaith Web Content OS — Stable V19 Restore Manifest

Date: 2026-08-22

## Stable source snapshot

- Repository: `webghaith-gif/ghaith-web-content-os`
- Stable branch: `stable-v19-ui-navigation-gpt-canva-2026-08-22`
- Code snapshot commit: `eafc13e42bd860aeb84aad74aa412d62bd1a9ddc`
- Production project: `ghaith-web-content-os`
- Canonical production: `https://ghaith-web-content-os.vercel.app`
- Browser-safe app: `https://ghaith-web-content-os.vercel.app/browser.html`
- Standalone/PWA page: `https://ghaith-web-content-os.vercel.app/app-standalone.html`
- Health endpoint: `https://ghaith-web-content-os.vercel.app/api/health`

## What this snapshot preserves

1. GPT/ChatGPT intake route and the existing human approval gate.
2. Report pipeline waiting for a GPT package instead of automatically replacing it with Gemini-generated content.
3. Existing ClickUp → Make publishing architecture.
4. Google Drive / Canva / Remotion integration code and current configuration model.
5. Newest-first opportunity ordering.
6. Product UI controller bundled directly into generated production pages so the Products icon and product entry points remain functional even if `/products.js` is not served separately.
7. Navigation hardening for Products and Notifications.
8. Back/forward arrows on the main app and inside the full-screen/mobile notification center.
9. UI regression tests in `tests/ui-navigation.test.ts`.

## Important UI fixes in V19

- Root cause of the dead Products icon: the live deployment returned HTTP 404 for `/products.js` while `index.html` depended on that script.
- Fix: `scripts/copy-static.mjs` now inlines `src/web/products.js` into generated production pages.
- `src/web/ui-hardening.js` adds notification back/forward controls and keeps product/notification navigation history usable.
- A source-level UI test guards the sidebar icons, product launchers, and history controls.

## Restore the full code

### Option A — GitHub branch

Open:
`https://github.com/webghaith-gif/ghaith-web-content-os/tree/stable-v19-ui-navigation-gpt-canva-2026-08-22`

### Option B — ZIP of every file and all code

Download:
`https://github.com/webghaith-gif/ghaith-web-content-os/archive/refs/heads/stable-v19-ui-navigation-gpt-canva-2026-08-22.zip`

### Option C — Restore main to the exact code snapshot

Use commit:
`eafc13e42bd860aeb84aad74aa412d62bd1a9ddc`

Git command if working locally:

```bash
git fetch origin
git checkout main
git reset --hard eafc13e42bd860aeb84aad74aa412d62bd1a9ddc
git push --force-with-lease origin main
```

Safer alternative: create a new recovery branch from the stable branch and deploy that branch first before changing `main`.

## Critical files for the UI/navigation fix

- `src/web/index.html`
- `src/web/app.js`
- `src/web/products.js`
- `src/web/notification-center.js`
- `src/web/notification-history.js`
- `src/web/notification-ui-sync.js`
- `src/web/ui-hardening.js`
- `src/web/styles.css`
- `scripts/copy-static.mjs`
- `tests/ui-navigation.test.ts`

## Critical backend/workflow files

- `src/server.ts`
- `src/application.ts`
- `src/services/report-pipeline.service.ts`
- `src/services/gpt-intake.service.ts`
- `src/services/content-generation.service.ts`
- `src/services/product-generation.service.ts`
- `src/services/asset.service.ts`
- `src/services/publishing-orchestrator.ts`
- `src/services/clickup-watch-contract.ts`
- `src/integrations/canva.adapter.ts`
- `src/integrations/google-drive.adapter.ts`
- `src/integrations/remotion.adapter.ts`
- `src/integrations/openai.adapter.ts`
- `src/config/env.ts`

## Restore rules

- Do not publish any content automatically without the existing human approval gate.
- Do not replace a GPT-authored package with Gemini output.
- Canva remains the editable visual library/bridge; the app matches visual assets to platform-specific copy and prepares publishing.
- Preserve the ClickUp READY → Make → platform flow unless a verified blocker requires a change.

## Verification status at snapshot time

Source inspection and UI regression guards were completed. The previous live production showed the exact Products failure as `/products.js` = HTTP 404. The V19 source fix is preserved here. At the time this restore manifest was created, Vercel Hobby was temporarily rejecting the newest `main` builds with `build-rate-limit`; therefore production should be rechecked after the next successful deployment before calling the live deployment fully verified.

# Ghaith Web Content OS — Stable V19 Restore Manifest

Date: 2026-08-22

## Stable source snapshot

- Repository: `webghaith-gif/ghaith-web-content-os`
- Stable branch: `stable-v19-ui-navigation-gpt-canva-2026-08-22`
- Code snapshot commit: `eafc13e42bd860aeb84aad74aa412d62bd1a9ddc`
- Stable manifest commit: `4db44443c3d6349baf3d6813a54189004fd36d22`
- Vercel project: `ghaith-web-content-os`
- Canonical production: `https://ghaith-web-content-os.vercel.app`
- Browser app: `https://ghaith-web-content-os.vercel.app/browser.html`
- Standalone/PWA: `https://ghaith-web-content-os.vercel.app/app-standalone.html`
- Health: `https://ghaith-web-content-os.vercel.app/api/health`

## Stable V19 scope

- GPT/ChatGPT package intake preserved.
- Canva remains the editable visual library/bridge.
- The app matches each platform-specific visual with its platform-specific copy/caption and prepares publishing.
- Human approval remains mandatory before READY/publishing.
- ClickUp → Make publishing flow preserved.
- Product navigation fix preserved.
- Notification back/forward navigation preserved.
- UI navigation regression tests preserved.

## Products bug and fix

The live application had `index.html` referencing `/products.js?v=18`, while the deployment returned HTTP 404 for `/products.js`. Therefore the Products button existed visually but its controller did not execute.

V19 fixes this by having `scripts/copy-static.mjs` inline `src/web/products.js` into generated app HTML, removing the runtime dependency on `/products.js` for product navigation.

## Restore links

Repository:
`https://github.com/webghaith-gif/ghaith-web-content-os`

Stable branch:
`https://github.com/webghaith-gif/ghaith-web-content-os/tree/stable-v19-ui-navigation-gpt-canva-2026-08-22`

Full ZIP — every tracked file and source code in the stable branch:
`https://github.com/webghaith-gif/ghaith-web-content-os/archive/refs/heads/stable-v19-ui-navigation-gpt-canva-2026-08-22.zip`

Code snapshot commit:
`https://github.com/webghaith-gif/ghaith-web-content-os/commit/eafc13e42bd860aeb84aad74aa412d62bd1a9ddc`

Stable restore manifest:
`https://github.com/webghaith-gif/ghaith-web-content-os/blob/stable-v19-ui-navigation-gpt-canva-2026-08-22/RESTORE_STABLE_V19.md`

## Critical UI files

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

## Critical workflow/backend files

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

## Recovery commands

```bash
git fetch origin
git checkout main
git reset --hard eafc13e42bd860aeb84aad74aa412d62bd1a9ddc
git push --force-with-lease origin main
```

Safer recovery: deploy the stable branch first, verify it, then move `main` only if needed.

## Non-negotiable restore rules

- Never auto-publish without the human approval gate.
- Never replace an existing GPT-authored package with Gemini output.
- Preserve Canva as editable visual storage/bridge, not as the content author.
- Preserve platform-specific asset/caption matching.
- Preserve ClickUp READY → Make → platform publishing unless a verified blocker requires a fix.
